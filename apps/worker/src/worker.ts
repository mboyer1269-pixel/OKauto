import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma, type VehicleStatus } from "@okauto/db";
import { dollarsToCents, normalizeVin } from "@okauto/shared";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const REDIS_URL = process.env.REDIS_URL ?? "";

export type FeedSyncJob = { sourceId: string };

async function applyFeedVehicles(
  organizationId: string,
  sourceId: string,
  items: Array<Record<string, unknown>>,
) {
  let created = 0;
  let updated = 0;
  const soldDetected: string[] = [];

  for (const item of items) {
    const vin = normalizeVin(String(item.vin ?? ""));
    if (!vin) continue;
    const price = Number(item.price ?? 0);
    const priceCents =
      Number(item.priceCents) > 0
        ? Math.round(Number(item.priceCents))
        : dollarsToCents(price);
    const status = String(item.status ?? "available") as VehicleStatus;
    const payload = {
      stockNumber: item.stockNumber ? String(item.stockNumber) : null,
      year: Number(item.year) || new Date().getFullYear(),
      make: String(item.make ?? "Unknown"),
      model: String(item.model ?? "Unknown"),
      trim: item.trim ? String(item.trim) : null,
      priceCents,
      mileage: item.mileage != null ? Number(item.mileage) : null,
      photoUrls: Array.isArray(item.photoUrls)
        ? (item.photoUrls as string[])
        : typeof item.photoUrls === "string"
          ? String(item.photoUrls).split("|").filter(Boolean)
          : [],
      status,
      sourceId,
      lastSyncedAt: new Date(),
      description: item.description ? String(item.description) : null,
    };

    const existing = await prisma.vehicle.findUnique({
      where: { organizationId_vin: { organizationId, vin } },
    });
    if (!existing) {
      await prisma.vehicle.create({ data: { organizationId, vin, ...payload } });
      created += 1;
      continue;
    }
    if (existing.status !== "sold" && status === "sold") {
      soldDetected.push(existing.id);
    }
    if (existing.priceCents !== priceCents) {
      await prisma.vehiclePriceHistory.create({
        data: { vehicleId: existing.id, priceCents },
      });
    }
    await prisma.vehicle.update({ where: { id: existing.id }, data: payload });
    updated += 1;
  }

  return { created, updated, soldDetected };
}

export async function syncFeedSource(sourceId: string) {
  const source = await prisma.inventorySource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "feed") {
    throw new Error(`Feed source not found: ${sourceId}`);
  }
  const config = source.config as { feedUrl?: string; intervalMinutes?: number };
  if (!config.feedUrl) throw new Error("feedUrl missing");

  try {
    const res = await fetch(config.feedUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
    const payload = (await res.json()) as unknown;
    const items = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : Array.isArray((payload as { vehicles?: unknown }).vehicles)
        ? ((payload as { vehicles: Record<string, unknown>[] }).vehicles)
        : [];

    const { created, updated, soldDetected } = await applyFeedVehicles(
      source.organizationId,
      source.id,
      items,
    );

    if (soldDetected.length) {
      const vehicles = await prisma.vehicle.findMany({
        where: { id: { in: soldDetected } },
      });
      const listings = await prisma.listing.findMany({
        where: {
          vehicleId: { in: soldDetected },
          status: { in: ["posted", "ready"] },
        },
      });
      await prisma.listing.updateMany({
        where: { id: { in: listings.map((l) => l.id) } },
        data: { status: "needs_removal" },
      });
      for (const listing of listings) {
        await prisma.listingEvent.create({
          data: {
            listingId: listing.id,
            type: "needs_removal",
            meta: { reason: "feed_sold" },
          },
        });
        const v = vehicles.find((x) => x.id === listing.vehicleId);
        await prisma.notification.create({
          data: {
            organizationId: source.organizationId,
            userId: listing.userId,
            type: "vehicle_sold",
            title: "Vehicle sold — remove Marketplace listing",
            body: v
              ? `${v.year} ${v.make} ${v.model} was marked sold in inventory feed.`
              : "A listed vehicle was marked sold.",
            meta: { vehicleId: listing.vehicleId },
          },
        });
      }
    }

    await prisma.inventorySource.update({
      where: { id: source.id },
      data: {
        health: "healthy",
        lastSyncAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFails: 0,
        config: {
          ...config,
          lastResult: { created, updated, soldDetected: soldDetected.length },
        },
      },
    });

    log.info({ sourceId, created, updated, sold: soldDetected.length }, "feed sync ok");
    return { created, updated, soldDetected: soldDetected.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    await prisma.inventorySource.update({
      where: { id: source.id },
      data: {
        health: "failed",
        lastSyncAt: new Date(),
        lastError: message,
        consecutiveFails: { increment: 1 },
      },
    });
    throw err;
  }
}

async function enqueueDueFeeds(queue: Queue | null) {
  const sources = await prisma.inventorySource.findMany({ where: { type: "feed" } });
  for (const source of sources) {
    const config = source.config as { intervalMinutes?: number };
    const intervalMs = (config.intervalMinutes ?? 60) * 60_000;
    const due =
      !source.lastSyncAt || Date.now() - source.lastSyncAt.getTime() >= intervalMs;
    if (!due) continue;
    if (queue) {
      await queue.add("feed-sync", { sourceId: source.id } satisfies FeedSyncJob, {
        removeOnComplete: 100,
        removeOnFail: 100,
      });
    } else {
      await syncFeedSource(source.id).catch((err) =>
        log.error({ err, sourceId: source.id }, "in-process feed sync failed"),
      );
    }
  }
}

export async function startWorker() {
  let connection: Redis | null = null;
  let queue: Queue | null = null;

  if (REDIS_URL) {
    try {
      connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
      await connection.ping();
      queue = new Queue("okauto-jobs", { connection });
      const worker = new Worker(
        "okauto-jobs",
        async (job) => {
          if (job.name === "feed-sync") {
            return syncFeedSource((job.data as FeedSyncJob).sourceId);
          }
          log.warn({ job: job.name }, "unknown job");
        },
        { connection },
      );
      worker.on("failed", (job, err) => {
        log.error({ err, jobId: job?.id }, "job failed");
      });
      log.info("BullMQ worker started");
    } catch (err) {
      log.warn({ err }, "Redis unavailable — using in-process scheduler");
      connection = null;
      queue = null;
    }
  } else {
    log.info("REDIS_URL unset — using in-process scheduler");
  }

  const tick = async () => {
    try {
      await enqueueDueFeeds(queue);
    } catch (err) {
      log.error({ err }, "scheduler tick failed");
    }
  };
  await tick();
  setInterval(tick, 5 * 60_000);

  process.on("SIGTERM", async () => {
    await queue?.close();
    await connection?.quit();
    await prisma.$disconnect();
    process.exit(0);
  });
}
