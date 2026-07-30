/**
 * LotPilot worker — scheduled jobs:
 *   - sync-due-sources: poll inventory feeds and apply the sync pipeline
 *   - stale-listings: nudge salespeople about old posts and pending delists
 *   - dispatch-emails: email fan-out for notifications
 *
 * Runs on BullMQ (Redis) when REDIS_URL is set (multi-instance safe);
 * otherwise falls back to a single-process interval scheduler for dev.
 */
import { prisma } from "@lotpilot/db";
import { dispatchEmails } from "./jobs/dispatch-emails.js";
import { flagStaleListings } from "./jobs/stale-listings.js";
import { syncDueSources } from "./jobs/sync-due-sources.js";
import { log } from "./log.js";

const TICK_MINUTES = Math.max(1, Number.parseInt(process.env.SYNC_TICK_MINUTES ?? "1", 10) || 1);

type JobName = "sync-due-sources" | "stale-listings" | "dispatch-emails";

const JOBS: Record<JobName, () => Promise<unknown>> = {
  "sync-due-sources": syncDueSources,
  "stale-listings": flagStaleListings,
  "dispatch-emails": dispatchEmails,
};

const SCHEDULES: Record<JobName, number> = {
  "sync-due-sources": TICK_MINUTES * 60_000,
  "stale-listings": 15 * 60_000,
  "dispatch-emails": 60_000,
};

async function beat(): Promise<void> {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { name: "worker" },
      update: { lastBeatAt: new Date() },
      create: { name: "worker", lastBeatAt: new Date() },
    });
  } catch (err) {
    log("error", "heartbeat failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function runJob(name: JobName): Promise<void> {
  try {
    const result = await JOBS[name]();
    log("info", `job ${name} finished`, { result });
  } catch (err) {
    log("error", `job ${name} crashed`, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function startWithBullMq(redisUrl: string): Promise<void> {
  const { Queue, Worker } = await import("bullmq");
  const connection = { url: redisUrl };
  const queue = new Queue("lotpilot-jobs", { connection });

  for (const [name, everyMs] of Object.entries(SCHEDULES) as Array<[JobName, number]>) {
    await queue.upsertJobScheduler(`schedule-${name}`, { every: everyMs }, { name });
  }

  const worker = new Worker(
    "lotpilot-jobs",
    async (job) => {
      await runJob(job.name as JobName);
      await beat();
    },
    { connection, concurrency: 2 },
  );
  worker.on("failed", (job, err) => log("error", "bullmq job failed", { job: job?.name, error: err.message }));
  log("info", "worker started (BullMQ mode)", { tickMinutes: TICK_MINUTES });

  const shutdown = async () => {
    log("info", "shutting down");
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function startInline(): void {
  log("info", "worker started (inline scheduler mode — set REDIS_URL for BullMQ)", {
    tickMinutes: TICK_MINUTES,
  });
  const timers: NodeJS.Timeout[] = [];
  for (const [name, everyMs] of Object.entries(SCHEDULES) as Array<[JobName, number]>) {
    void runJob(name);
    timers.push(setInterval(() => void runJob(name), everyMs));
  }
  timers.push(setInterval(() => void beat(), 60_000));
  void beat();

  const shutdown = async () => {
    log("info", "shutting down");
    for (const t of timers) clearInterval(t);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  startWithBullMq(redisUrl).catch((err) => {
    log("error", "failed to start BullMQ mode, falling back to inline", {
      error: err instanceof Error ? err.message : String(err),
    });
    startInline();
  });
} else {
  startInline();
}
