import {
  normalizeCsvRecord,
  normalizeJsonRecord,
  parseCsvWithHeaders,
  type NormalizationResult,
  type VehicleInput,
} from "@openlot/shared";
import { and, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { feedSources, priceHistory, syncRuns, vehicles } from "../db/schema.js";
import { enqueueJob } from "../jobs/queue.js";

/**
 * Inventory synchronization engine.
 *
 * Upserts normalized vehicles keyed by (orgId, VIN), records price history,
 * detects vehicles that disappeared from the source (sold detection) and
 * fans out alert jobs. Used by CSV imports, URL feed syncs and the scheduler.
 */

export interface SyncStats {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  restored: number;
  markedSold: number;
  priceChanges: number;
  skipped: number;
  errors: { row: number; vin?: string; messages: string[] }[];
}

export interface SyncOptions {
  orgId: string;
  source: "CSV" | "FEED";
  feedSourceId?: string | null;
  markMissingAsSold: boolean;
  trigger: "MANUAL" | "SCHEDULED" | "CSV";
}

export interface SyncOutcome {
  syncRunId: string;
  stats: SyncStats;
}

function emptyStats(): SyncStats {
  return {
    total: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    restored: 0,
    markedSold: 0,
    priceChanges: 0,
    skipped: 0,
    errors: [],
  };
}

/** Fields synced from feeds. Manual/AI descriptions are preserved. */
const SYNCABLE_FIELDS = [
  "stockNumber", "year", "make", "model", "trim", "bodyStyle", "condition", "mileage",
  "priceCents", "exteriorColor", "interiorColor", "transmission", "fuelType",
  "drivetrain", "engine", "doors",
] as const;

export async function runInventorySync(
  db: Db,
  inputs: NormalizationResult[],
  options: SyncOptions,
): Promise<SyncOutcome> {
  const [run] = await db
    .insert(syncRuns)
    .values({
      orgId: options.orgId,
      feedSourceId: options.feedSourceId ?? null,
      trigger: options.trigger,
      status: "RUNNING",
    })
    .returning({ id: syncRuns.id });
  const syncRunId = run!.id;

  const stats = emptyStats();
  const seenVins: string[] = [];
  const priceChangedVehicleIds: string[] = [];
  const soldVehicleIds: string[] = [];

  try {
    stats.total = inputs.length;

    for (let i = 0; i < inputs.length; i++) {
      const result = inputs[i]!;
      if (!result.ok || !result.vehicle) {
        stats.skipped++;
        stats.errors.push({ row: i + 1, vin: result.rawVin, messages: result.errors ?? ["Unparseable row"] });
        continue;
      }
      const v = result.vehicle;
      if (seenVins.includes(v.vin)) {
        stats.skipped++;
        stats.errors.push({ row: i + 1, vin: v.vin, messages: ["Duplicate VIN within import; row skipped"] });
        continue;
      }
      seenVins.push(v.vin);

      const [existing] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.orgId, options.orgId), eq(vehicles.vin, v.vin)))
        .limit(1);

      if (!existing) {
        const [inserted] = await db
          .insert(vehicles)
          .values({
            orgId: options.orgId,
            vin: v.vin,
            stockNumber: v.stockNumber ?? null,
            year: v.year,
            make: v.make,
            model: v.model,
            trim: v.trim ?? null,
            bodyStyle: v.bodyStyle ?? null,
            condition: v.condition,
            mileage: v.mileage ?? null,
            priceCents: v.priceCents ?? null,
            exteriorColor: v.exteriorColor ?? null,
            interiorColor: v.interiorColor ?? null,
            transmission: v.transmission ?? null,
            fuelType: v.fuelType ?? null,
            drivetrain: v.drivetrain ?? null,
            engine: v.engine ?? null,
            doors: v.doors ?? null,
            description: v.description ?? null,
            descriptionSource: v.description ? "FEED" : null,
            features: v.features,
            photoUrls: v.photoUrls,
            status: "AVAILABLE",
            source: options.source,
            feedSourceId: options.feedSourceId ?? null,
          })
          .returning({ id: vehicles.id });
        stats.created++;
        if (v.priceCents !== undefined) {
          await db.insert(priceHistory).values({
            vehicleId: inserted!.id,
            priceCents: v.priceCents,
            source: options.source,
          });
        }
        continue;
      }

      // Existing vehicle: compute a minimal patch.
      const patch: Record<string, unknown> = {};
      for (const field of SYNCABLE_FIELDS) {
        const incoming = (v as Record<string, unknown>)[field];
        if (incoming !== undefined && incoming !== (existing as Record<string, unknown>)[field]) {
          patch[field] = incoming;
        }
      }
      // Photos/features replace only when the feed provides them.
      if (v.photoUrls.length > 0 && JSON.stringify(v.photoUrls) !== JSON.stringify(existing.photoUrls)) {
        patch.photoUrls = v.photoUrls;
      }
      if (v.features.length > 0 && JSON.stringify(v.features) !== JSON.stringify(existing.features)) {
        patch.features = v.features;
      }
      // Feed descriptions never clobber manually written or AI copy.
      if (v.description && (existing.descriptionSource === "FEED" || existing.descriptionSource === null)) {
        if (v.description !== existing.description) {
          patch.description = v.description;
          patch.descriptionSource = "FEED";
        }
      }

      const priceChanged =
        v.priceCents !== undefined && existing.priceCents !== null && v.priceCents !== existing.priceCents;
      const wasAutoSold = existing.status === "SOLD" && existing.soldDetectedAt !== null;

      if (wasAutoSold) {
        // Vehicle reappeared in the source after being auto-marked sold.
        patch.status = "AVAILABLE";
        patch.soldDetectedAt = null;
        stats.restored++;
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        patch.lastSeenAt = new Date();
        await db.update(vehicles).set(patch).where(eq(vehicles.id, existing.id));
        if (!wasAutoSold) stats.updated++;
      } else {
        await db.update(vehicles).set({ lastSeenAt: new Date() }).where(eq(vehicles.id, existing.id));
        stats.unchanged++;
      }

      if (priceChanged) {
        stats.priceChanges++;
        priceChangedVehicleIds.push(existing.id);
        await db.insert(priceHistory).values({
          vehicleId: existing.id,
          priceCents: v.priceCents!,
          source: options.source,
        });
      }
    }

    // Sold detection: available vehicles from this source missing from the import.
    if (options.markMissingAsSold && seenVins.length > 0) {
      const sourceFilter = options.feedSourceId
        ? eq(vehicles.feedSourceId, options.feedSourceId)
        : or(eq(vehicles.source, "CSV"), isNull(vehicles.feedSourceId));
      const missing = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.orgId, options.orgId),
            eq(vehicles.status, "AVAILABLE"),
            sourceFilter,
            ne(vehicles.source, "MANUAL"),
            notInArray(vehicles.vin, seenVins),
          ),
        );
      if (missing.length > 0) {
        const ids = missing.map((m) => m.id);
        await db
          .update(vehicles)
          .set({ status: "SOLD", soldDetectedAt: new Date(), updatedAt: new Date() })
          .where(inArray(vehicles.id, ids));
        stats.markedSold = ids.length;
        soldVehicleIds.push(...ids);
      }
    }

    // Fan out alert jobs.
    if (soldVehicleIds.length > 0) {
      await enqueueJob(db, "sold_alerts", { orgId: options.orgId, vehicleIds: soldVehicleIds, syncRunId });
    }
    if (priceChangedVehicleIds.length > 0) {
      await enqueueJob(db, "price_change_alerts", {
        orgId: options.orgId,
        vehicleIds: priceChangedVehicleIds,
        syncRunId,
      });
    }

    await db
      .update(syncRuns)
      .set({ status: "SUCCEEDED", stats, finishedAt: new Date() })
      .where(eq(syncRuns.id, syncRunId));
    return { syncRunId, stats };
  } catch (err) {
    await db
      .update(syncRuns)
      .set({
        status: "FAILED",
        stats,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, syncRunId));
    throw err;
  }
}

/** Parse and normalize raw CSV text into per-row normalization results. */
export function normalizeCsvText(csv: string): NormalizationResult[] {
  const { headers, records } = parseCsvWithHeaders(csv);
  return records.map((record) => normalizeCsvRecord(record, headers));
}

/** Parse and normalize a JSON feed body (array or {vehicles|items|inventory: []}). */
export function normalizeJsonFeed(body: unknown): NormalizationResult[] {
  let items: unknown[] = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const key = ["vehicles", "items", "inventory", "data"].find((k) => Array.isArray(obj[k]));
    if (key) items = obj[key] as unknown[];
  }
  return items.map((item) =>
    item && typeof item === "object"
      ? normalizeJsonRecord(item as Record<string, unknown>)
      : { ok: false, errors: ["Feed item is not an object"] },
  );
}

/** Fetch a feed source and run a full sync for it. */
export async function syncFeedSource(
  db: Db,
  feedSourceId: string,
  trigger: "MANUAL" | "SCHEDULED",
  fetchImpl: typeof fetch = fetch,
): Promise<SyncOutcome> {
  const [feed] = await db.select().from(feedSources).where(eq(feedSources.id, feedSourceId)).limit(1);
  if (!feed) throw new Error(`Feed source ${feedSourceId} not found`);

  let outcome: SyncOutcome;
  try {
    const response = await fetchImpl(feed.url, {
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "OpenLot-Sync/1.0" },
    });
    if (!response.ok) throw new Error(`Feed fetch failed with HTTP ${response.status}`);
    const inputs =
      feed.type === "CSV_URL" ? normalizeCsvText(await response.text()) : normalizeJsonFeed(await response.json());
    outcome = await runInventorySync(db, inputs, {
      orgId: feed.orgId,
      source: "FEED",
      feedSourceId: feed.id,
      markMissingAsSold: feed.markMissingAsSold,
      trigger,
    });
    await db
      .update(feedSources)
      .set({ lastRunAt: new Date(), lastStatus: "SUCCEEDED", updatedAt: new Date() })
      .where(eq(feedSources.id, feed.id));
    return outcome;
  } catch (err) {
    await db
      .update(feedSources)
      .set({ lastRunAt: new Date(), lastStatus: "FAILED", updatedAt: new Date() })
      .where(eq(feedSources.id, feed.id));
    throw err;
  }
}
