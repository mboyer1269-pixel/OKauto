import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  feedSources, listings, notifications, organizations, vehicles,
} from "../db/schema.js";
import type { AiService } from "../services/ai.js";
import { formatUsd } from "@openlot/shared";
import type { DescriptionTone } from "@openlot/shared";
import { claimNextJob, completeJob, enqueueJob, failJob, type JobRow } from "./queue.js";

export interface WorkerDeps {
  db: Db;
  ai: AiService;
  fetchImpl?: typeof fetch;
  logger?: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
  /** Injected to avoid a circular import; defaults to the real implementation. */
  syncFeedSourceImpl?: (db: Db, feedSourceId: string, trigger: "MANUAL" | "SCHEDULED", fetchImpl?: typeof fetch) => Promise<unknown>;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

/** Notify owners of active/prepared listings that their vehicle sold. */
export async function handleSoldAlerts(db: Db, payload: { orgId: string; vehicleIds: string[] }): Promise<void> {
  if (payload.vehicleIds.length === 0) return;
  const rows = await db
    .select({
      listingId: listings.id,
      userId: listings.userId,
      vehicleId: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      vin: vehicles.vin,
    })
    .from(listings)
    .innerJoin(vehicles, eq(listings.vehicleId, vehicles.id))
    .where(
      and(
        eq(listings.orgId, payload.orgId),
        inArray(listings.vehicleId, payload.vehicleIds),
        inArray(listings.status, ["ACTIVE", "PREPARED"]),
      ),
    );
  for (const row of rows) {
    await db.insert(notifications).values({
      orgId: payload.orgId,
      userId: row.userId,
      type: "VEHICLE_SOLD",
      title: `Sold: ${row.year} ${row.make} ${row.model}`,
      body: `This vehicle (VIN ${row.vin}) is no longer in inventory. Please remove your Marketplace listing so buyers only see available vehicles.`,
      meta: { vehicleId: row.vehicleId, listingId: row.listingId },
    });
  }
}

/** Notify owners of active listings that the vehicle price changed. */
export async function handlePriceChangeAlerts(
  db: Db,
  payload: { orgId: string; vehicleIds: string[] },
): Promise<void> {
  if (payload.vehicleIds.length === 0) return;
  const rows = await db
    .select({
      listingId: listings.id,
      userId: listings.userId,
      vehicleId: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      priceCents: vehicles.priceCents,
    })
    .from(listings)
    .innerJoin(vehicles, eq(listings.vehicleId, vehicles.id))
    .where(
      and(
        eq(listings.orgId, payload.orgId),
        inArray(listings.vehicleId, payload.vehicleIds),
        eq(listings.status, "ACTIVE"),
      ),
    );
  for (const row of rows) {
    await db.insert(notifications).values({
      orgId: payload.orgId,
      userId: row.userId,
      type: "PRICE_CHANGED",
      title: `Price update: ${row.year} ${row.make} ${row.model}`,
      body:
        row.priceCents !== null
          ? `The price changed to ${formatUsd(row.priceCents)}. Update your Marketplace listing to match.`
          : "The price changed. Update your Marketplace listing to match.",
      meta: { vehicleId: row.vehicleId, listingId: row.listingId },
    });
  }
}

/** Generate (or regenerate) a vehicle description via the AI service. */
export async function handleGenerateDescription(
  db: Db,
  ai: AiService,
  payload: {
    vehicleId: string;
    tone?: DescriptionTone;
    includeDisclaimer?: boolean;
    maxLength?: number;
  },
): Promise<void> {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, payload.vehicleId)).limit(1);
  if (!vehicle) return;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, vehicle.orgId)).limit(1);
  const result = await ai.generateVehicleDescription(
    {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      bodyStyle: vehicle.bodyStyle as never,
      condition: vehicle.condition as never,
      mileage: vehicle.mileage,
      priceCents: vehicle.priceCents,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      transmission: vehicle.transmission as never,
      fuelType: vehicle.fuelType as never,
      drivetrain: vehicle.drivetrain as never,
      engine: vehicle.engine,
      doors: vehicle.doors,
      features: (vehicle.features as string[]) ?? [],
      dealershipName: org?.name,
      dealershipPhone: org?.phone,
      dealershipCity: org?.city,
    },
    {
      tone: payload.tone ?? "PROFESSIONAL",
      includeDisclaimer: payload.includeDisclaimer ?? true,
      maxLength: payload.maxLength ?? 2500,
    },
  );
  await db
    .update(vehicles)
    .set({ description: result.text, descriptionSource: result.source, updatedAt: new Date() })
    .where(eq(vehicles.id, vehicle.id));
}

/** Flag listings that have been live beyond the org's staleness threshold. */
export async function handleStaleListingScan(db: Db, payload: { staleDays?: number }): Promise<void> {
  const staleDays = payload.staleDays ?? 7;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      listingId: listings.id,
      orgId: listings.orgId,
      userId: listings.userId,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
    })
    .from(listings)
    .innerJoin(vehicles, eq(listings.vehicleId, vehicles.id))
    .where(and(eq(listings.status, "ACTIVE"), lt(listings.publishedAt, cutoff)));
  for (const row of rows) {
    // Avoid duplicate reminders while a previous one is still unread.
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, row.userId),
          eq(notifications.type, "LISTING_STALE"),
          isNull(notifications.readAt),
          sql`${notifications.meta} ->> 'listingId' = ${row.listingId}`,
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(notifications).values({
      orgId: row.orgId,
      userId: row.userId,
      type: "LISTING_STALE",
      title: `Listing needs a refresh: ${row.year} ${row.make} ${row.model}`,
      body: `This listing has been live for over ${staleDays} days. Consider renewing it on Marketplace to keep it visible.`,
      meta: { listingId: row.listingId },
    });
  }
}

/** Enqueue syncs for feeds whose interval has elapsed. */
export async function scheduleDueFeeds(db: Db): Promise<number> {
  const feeds = await db.select().from(feedSources).where(eq(feedSources.active, true));
  let scheduled = 0;
  const now = Date.now();
  for (const feed of feeds) {
    if (feed.intervalMinutes <= 0) continue;
    const due = !feed.lastRunAt || feed.lastRunAt.getTime() + feed.intervalMinutes * 60_000 <= now;
    if (!due) continue;
    const id = await enqueueJob(
      db,
      "feed_sync",
      { feedSourceId: feed.id, trigger: "SCHEDULED" },
      { dedupeKey: `feed_sync:${feed.id}` },
    );
    if (id) scheduled++;
  }
  return scheduled;
}

/* ------------------------------------------------------------------ */
/* Dispatcher & loop                                                   */
/* ------------------------------------------------------------------ */

export async function dispatchJob(deps: WorkerDeps, job: JobRow): Promise<void> {
  // Payloads are produced by our own enqueue sites; trust their shape here.
  const payload = job.payload as never;
  switch (job.type) {
    case "sold_alerts":
      return handleSoldAlerts(deps.db, payload);
    case "price_change_alerts":
      return handlePriceChangeAlerts(deps.db, payload);
    case "generate_description":
      return handleGenerateDescription(deps.db, deps.ai, payload);
    case "stale_listing_scan":
      return handleStaleListingScan(deps.db, payload);
    case "feed_sync": {
      const impl =
        deps.syncFeedSourceImpl ??
        (await import("../services/inventorySync.js")).syncFeedSource;
      await impl(deps.db, (payload as { feedSourceId: string }).feedSourceId, "SCHEDULED", deps.fetchImpl);
      return;
    }
    case "feed_schedule_tick":
      await scheduleDueFeeds(deps.db);
      return;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/** Process at most `limit` runnable jobs; returns the number processed. */
export async function processPendingJobs(deps: WorkerDeps, limit = 20): Promise<number> {
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claimNextJob(deps.db);
    if (!job) break;
    try {
      await dispatchJob(deps, job);
      await completeJob(deps.db, job.id);
    } catch (err) {
      deps.logger?.error({ jobId: job.id, type: job.type, err: err instanceof Error ? err.message : String(err) }, "job failed");
      await failJob(deps.db, job, err);
    }
    processed++;
  }
  return processed;
}

export interface WorkerLoopHandle {
  stop: () => Promise<void>;
}

/** Continuous polling loop with a feed-scheduler heartbeat. */
export function startWorkerLoop(
  deps: WorkerDeps,
  options: { pollIntervalMs: number; schedulerIntervalMs?: number },
): WorkerLoopHandle {
  let stopped = false;
  let lastScheduleCheck = 0;
  const schedulerIntervalMs = options.schedulerIntervalMs ?? 30_000;

  const loop = (async () => {
    while (!stopped) {
      try {
        if (Date.now() - lastScheduleCheck >= schedulerIntervalMs) {
          lastScheduleCheck = Date.now();
          await scheduleDueFeeds(deps.db);
        }
        const processed = await processPendingJobs(deps);
        if (processed === 0) {
          await sleep(options.pollIntervalMs);
        }
      } catch (err) {
        deps.logger?.error({ err: err instanceof Error ? err.message : String(err) }, "worker loop error");
        await sleep(options.pollIntervalMs);
      }
    }
  })();

  return {
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
