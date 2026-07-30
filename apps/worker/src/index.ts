import { Worker, Queue, type Job } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { db } from "@okauto/db";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "okauto-worker" },
});

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const QUEUE_NAME = "okauto-inventory";

export async function processSync(job: Job<{ orgId: string; sourceId?: string }>) {
  const { orgId, sourceId } = job.data;
  const run = await db.jobRun.create({
    data: {
      orgId,
      type: "inventory.sync",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const sources = await db.inventorySource.findMany({
      where: {
        orgId,
        ...(sourceId ? { id: sourceId } : {}),
      },
    });

    for (const source of sources) {
      const config = source.config as { url?: string };
      const missingFeed = source.type === "FEED_URL" && !config.url;
      await db.inventorySource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          health: missingFeed ? "DEGRADED" : "HEALTHY",
          lastError: missingFeed ? "Feed URL not configured" : null,
        },
      });
    }

    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        stats: { sources: sources.length },
      },
    });

    logger.info({ orgId, sources: sources.length }, "inventory sync complete");
    return { sources: sources.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.jobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw err;
  }
}

export async function processSoldDetection(job: Job<{ orgId: string }>) {
  const { orgId } = job.data;
  const soldWithActive = await db.vehicle.findMany({
    where: {
      orgId,
      status: "SOLD",
      listings: {
        some: { status: { in: ["PUBLISHED", "ASSISTING", "READY", "PRICE_STALE"] } },
      },
    },
    include: {
      listings: {
        where: { status: { in: ["PUBLISHED", "ASSISTING", "READY", "PRICE_STALE"] } },
      },
    },
  });

  let flagged = 0;
  for (const vehicle of soldWithActive) {
    for (const listing of vehicle.listings) {
      await db.listing.update({
        where: { id: listing.id },
        data: { status: "NEEDS_REMOVAL" },
      });
      await db.listingEvent.create({
        data: {
          listingId: listing.id,
          type: "SOLD_DETECTED",
          payload: { via: "worker" },
        },
      });
      await db.notification.create({
        data: {
          orgId,
          userId: listing.userId,
          type: "VEHICLE_SOLD",
          title: "Remove sold listing",
          body: `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stockNumber}) is sold.`,
          meta: { vehicleId: vehicle.id, listingId: listing.id },
        },
      });
      flagged++;
    }
  }

  logger.info({ orgId, flagged }, "sold detection complete");
  return { flagged };
}

async function processDetectSoldAll() {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const queue = new Queue(QUEUE_NAME, { connection });
  for (const org of orgs) {
    await queue.add("detect-sold", { orgId: org.id });
  }
  await queue.close();
  return { orgs: orgs.length };
}

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add(
    "detect-sold-all",
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: "detect-sold-all-repeat",
    },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "detect-sold-all") return processDetectSoldAll();
      if (job.name === "sync") return processSync(job as Job<{ orgId: string; sourceId?: string }>);
      if (job.name === "detect-sold") return processSoldDetection(job as Job<{ orgId: string }>);
      logger.warn({ name: job.name }, "unknown job");
      return null;
    },
    { connection },
  );

  worker.on("ready", () => logger.info("OKauto worker ready"));
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "job failed");
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
