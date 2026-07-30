/**
 * Inventory sync engine — shared by the API (manual trigger, CSV import) and
 * the worker (scheduled feed polls).
 *
 * Pipeline: fetch/receive raw records → field mapping → normalization →
 * diff against current DB snapshot → apply creates/updates/price changes →
 * missing/sold detection → notifications to salespeople with active listings.
 */
import {
  applyFieldMapping,
  computeSyncDiff,
  DEFAULT_FIELD_MAPPING,
  fieldMappingSchema,
  normalizeVehicle,
  parseCsvWithHeaders,
  vehicleTitle,
  type ExistingVehicleSnapshot,
  type FieldMapping,
  type NormalizedVehicle,
} from "@lotpilot/core";
import { type InventorySource, type PrismaClient } from "@prisma/client";
import { orgSettings } from "./settings.js";

export interface SyncStats {
  total: number;
  created: number;
  updated: number;
  priceChanges: number;
  markedMissing: number;
  markedSold: number;
  errors: Array<{ row: number; message: string }>;
}

export interface SyncOutcome {
  runId: string;
  status: "SUCCESS" | "FAILED";
  stats: SyncStats;
  error?: string;
}

function resolveMapping(raw: unknown): FieldMapping {
  const parsed = fieldMappingSchema.safeParse(raw ?? {});
  if (parsed.success && parsed.data.make && parsed.data.model) return parsed.data;
  return DEFAULT_FIELD_MAPPING;
}

/** Fetch and parse the raw records for a feed source (JSON array or CSV). */
export async function fetchFeedRecords(
  source: Pick<InventorySource, "type" | "url">,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>[]> {
  if (!source.url) throw new Error("Source has no URL configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetchImpl(source.url, {
      signal: controller.signal,
      headers: { "user-agent": "LotPilot-Sync/1.0" },
    });
    if (!res.ok) throw new Error(`Feed responded with HTTP ${res.status}`);
    if (source.type === "FEED_JSON") {
      const data: unknown = await res.json();
      const items = Array.isArray(data)
        ? data
        : typeof data === "object" &&
            data !== null &&
            Array.isArray((data as { vehicles?: unknown[] }).vehicles)
          ? (data as { vehicles: unknown[] }).vehicles
          : null;
      if (!items)
        throw new Error("JSON feed must be an array or an object with a 'vehicles' array");
      return items.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null);
    }
    const text = await res.text();
    return parseCsvWithHeaders(text).records;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apply a batch of raw records for a source. Creates a SyncRun, updates
 * vehicles, records price changes, runs sold detection, and fans out
 * notifications. Never throws for per-row problems — they land in stats.errors.
 */
export async function runSourceSync(
  prisma: PrismaClient,
  source: InventorySource,
  rawRecords: Record<string, unknown>[],
  opts: { trigger?: string } = {},
): Promise<SyncOutcome> {
  const run = await prisma.syncRun.create({
    data: { sourceId: source.id, trigger: opts.trigger ?? "schedule" },
  });

  const stats: SyncStats = {
    total: rawRecords.length,
    created: 0,
    updated: 0,
    priceChanges: 0,
    markedMissing: 0,
    markedSold: 0,
    errors: [],
  };

  try {
    const mapping = resolveMapping(source.fieldMapping);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: source.organizationId },
    });
    const settings = orgSettings(org.settings);

    const incoming: NormalizedVehicle[] = [];
    rawRecords.forEach((record, idx) => {
      const normalized = normalizeVehicle(applyFieldMapping(record, mapping));
      if ("error" in normalized) {
        stats.errors.push({ row: idx + 1, message: normalized.error });
      } else {
        for (const issue of normalized.issues) {
          stats.errors.push({ row: idx + 1, message: `${issue.field}: ${issue.message}` });
        }
        incoming.push(normalized);
      }
    });

    const existing = await prisma.vehicle.findMany({
      where: { organizationId: source.organizationId, sourceId: source.id },
      select: {
        id: true,
        vin: true,
        stockNumber: true,
        year: true,
        make: true,
        model: true,
        mileage: true,
        priceCents: true,
        status: true,
        missingSinceSyncs: true,
      },
    });

    const diff = computeSyncDiff(existing as ExistingVehicleSnapshot[], incoming, {
      soldThreshold: settings.soldDetectionThreshold,
    });

    const now = new Date();

    for (const record of diff.creates) {
      const { issues: _issues, photoUrls, ...fields } = record;
      // Guard against races/cross-source duplicates on the org-wide unique keys.
      const dupe = await prisma.vehicle.findFirst({
        where: {
          organizationId: source.organizationId,
          OR: [
            ...(fields.vin ? [{ vin: fields.vin }] : []),
            ...(fields.stockNumber ? [{ stockNumber: fields.stockNumber }] : []),
          ],
        },
        select: { id: true },
      });
      if (dupe) {
        await applyUpdate(prisma, dupe.id, record, now, source.id);
        stats.updated++;
        continue;
      }
      const vehicle = await prisma.vehicle.create({
        data: {
          ...fields,
          organizationId: source.organizationId,
          sourceId: source.id,
          firstSeenAt: now,
          lastSeenAt: now,
          missingSinceSyncs: 0,
        },
      });
      if (photoUrls.length > 0) {
        await prisma.vehiclePhoto.createMany({
          data: photoUrls.map((url, position) => ({ vehicleId: vehicle.id, url, position })),
        });
      }
      stats.created++;
    }

    for (const { existing: snapshot, incoming: record } of diff.updates) {
      await applyUpdate(prisma, snapshot.id, record, now, source.id);
      stats.updated++;
    }

    for (const change of diff.priceChanges) {
      await prisma.priceChange.create({
        data: {
          vehicleId: change.existing.id,
          syncRunId: run.id,
          oldPriceCents: change.oldPriceCents,
          newPriceCents: change.newPriceCents,
        },
      });
      stats.priceChanges++;
      await notifyActiveListers(prisma, change.existing.id, source.organizationId, {
        type: "PRICE_CHANGE",
        title: "Price changed — update your Marketplace listing",
        bodyFor: (title) =>
          `${title} changed from $${(change.oldPriceCents / 100).toLocaleString()} to $${(change.newPriceCents / 100).toLocaleString()}. Update your Facebook Marketplace listing.`,
      });
    }

    const soldIds = new Set(diff.toMarkSold.map((v) => v.id));
    for (const snapshot of diff.missing) {
      if (soldIds.has(snapshot.id)) continue;
      await prisma.vehicle.update({
        where: { id: snapshot.id },
        data: { missingSinceSyncs: { increment: 1 } },
      });
      stats.markedMissing++;
    }

    for (const snapshot of diff.toMarkSold) {
      await prisma.vehicle.update({
        where: { id: snapshot.id },
        data: { status: "SOLD", soldAt: now, missingSinceSyncs: { increment: 1 } },
      });
      stats.markedSold++;
      await prisma.listing.updateMany({
        where: { vehicleId: snapshot.id, status: "POSTED" },
        data: { status: "DELIST_REQUESTED" },
      });
      await notifyActiveListers(
        prisma,
        snapshot.id,
        source.organizationId,
        {
          type: "VEHICLE_SOLD",
          title: "Vehicle sold — delist your Marketplace post",
          bodyFor: (title) =>
            `${title} is no longer in inventory and was marked sold. Please remove your Facebook Marketplace listing.`,
        },
        ["POSTED", "DELIST_REQUESTED"],
      );
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", stats: JSON.parse(JSON.stringify(stats)), finishedAt: new Date() },
    });
    await prisma.inventorySource.update({
      where: { id: source.id },
      data: {
        status: "ACTIVE",
        lastError: null,
        lastSyncAt: new Date(),
        nextSyncAt: new Date(Date.now() + source.scheduleMinutes * 60_000),
      },
    });
    return { runId: run.id, status: "SUCCESS", stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: message,
        stats: JSON.parse(JSON.stringify(stats)),
        finishedAt: new Date(),
      },
    });
    await prisma.inventorySource.update({
      where: { id: source.id },
      data: {
        status: "ERROR",
        lastError: message,
        nextSyncAt: new Date(Date.now() + source.scheduleMinutes * 60_000),
      },
    });
    await notifyOrgManagers(prisma, source.organizationId, {
      type: "SYNC_FAILED",
      title: `Inventory sync failed: ${source.name}`,
      body: `The sync for "${source.name}" failed with: ${message}. Check Sync Health to retry.`,
      data: { sourceId: source.id, runId: run.id },
    });
    return { runId: run.id, status: "FAILED", stats, error: message };
  }
}

async function applyUpdate(
  prisma: PrismaClient,
  vehicleId: string,
  record: NormalizedVehicle,
  now: Date,
  sourceId: string,
): Promise<void> {
  const { issues: _issues, photoUrls, priceCents, ...fields } = record;
  const current = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { priceCents: true, status: true, description: true },
  });
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...fields,
      // Never clobber a curated description with a blank feed value.
      description: fields.description ?? current.description,
      priceCents: priceCents ?? current.priceCents,
      previousPriceCents:
        priceCents != null && current.priceCents != null && priceCents !== current.priceCents
          ? current.priceCents
          : undefined,
      sourceId,
      lastSeenAt: now,
      missingSinceSyncs: 0,
      // A vehicle reappearing in the feed after being marked sold gets revived.
      status: current.status === "SOLD" ? "AVAILABLE" : undefined,
      soldAt: current.status === "SOLD" ? null : undefined,
    },
  });
  if (photoUrls.length > 0) {
    const existingCount = await prisma.vehiclePhoto.count({ where: { vehicleId } });
    if (existingCount === 0) {
      await prisma.vehiclePhoto.createMany({
        data: photoUrls.map((url, position) => ({ vehicleId, url, position })),
      });
    }
  }
}

async function notifyActiveListers(
  prisma: PrismaClient,
  vehicleId: string,
  organizationId: string,
  message: { type: string; title: string; bodyFor: (title: string) => string },
  statuses: Array<"POSTED" | "DELIST_REQUESTED" | "PREPARED"> = ["POSTED", "PREPARED"],
): Promise<void> {
  const listings = await prisma.listing.findMany({
    where: { vehicleId, status: { in: statuses } },
    include: { vehicle: true },
  });
  const notified = new Set<string>();
  for (const listing of listings) {
    if (notified.has(listing.userId)) continue;
    notified.add(listing.userId);
    await prisma.notification.create({
      data: {
        organizationId,
        userId: listing.userId,
        type: message.type,
        title: message.title,
        body: message.bodyFor(vehicleTitle(listing.vehicle)),
        data: { vehicleId, listingId: listing.id },
      },
    });
  }
}

async function notifyOrgManagers(
  prisma: PrismaClient,
  organizationId: string,
  message: { type: string; title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const managers = await prisma.membership.findMany({
    where: { organizationId, role: { in: ["OWNER", "MANAGER"] } },
    select: { userId: true },
  });
  for (const m of managers) {
    await prisma.notification.create({
      data: {
        organizationId,
        userId: m.userId,
        type: message.type,
        title: message.title,
        body: message.body,
        data: JSON.parse(JSON.stringify(message.data ?? {})),
      },
    });
  }
}
