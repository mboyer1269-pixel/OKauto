import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@okauto/database";
import {
  DEGRADED_EVERY_MS,
  DEGRADED_JOB_NAME,
  REMINDER_EVERY_MS,
  REMINDER_JOB_NAME,
  SYNC_JOB_NAME,
  SYNC_TICK_EVERY_MS,
  SYNC_TICK_JOB_NAME,
  isDuplicateJobError,
  isLastAttempt,
  pingUptime,
  syncJobOptions,
  workerHeartbeatUrl,
} from "@okauto/shared";
import { runSyncSource } from "./sync.js";
import { processRemovalReminders } from "./reminders.js";
import { startWorkerHeartbeat } from "./heartbeat.js";
import { checkSyncDegraded } from "./degraded.js";
import { captureWorkerException, initWorkerSentry } from "./sentry.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const importQueue = new Queue("import", { connection });
export const syncQueue = new Queue("sync", { connection });
export const notificationQueue = new Queue("notifications", { connection });
export const maintenanceQueue = new Queue("maintenance", { connection });

const importWorker = new Worker(
  "import",
  async (job) => {
    console.log(`Processing import job ${job.id}`, job.data);
    const { importJobId } = job.data as { importJobId: string };

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    return { processed: true };
  },
  { connection },
);

async function notifySyncFailure(
  syncSourceId: string,
  err: unknown,
): Promise<void> {
  const source = await prisma.syncSource.findUnique({
    where: { id: syncSourceId },
  });
  if (!source) return;

  const managers = await prisma.organizationMember.findMany({
    where: {
      organizationId: source.organizationId,
      role: { in: ["OWNER", "ADMIN", "MANAGER"] },
    },
    select: { userId: true },
  });
  for (const manager of managers) {
    await prisma.notification.create({
      data: {
        userId: manager.userId,
        type: "SYNC_ERROR",
        title: `Synchronisation en échec : ${source.name}`,
        message: `${err instanceof Error ? err.message : "Erreur inconnue"}. Les retraits et les prix ne sont pas à jour tant que la synchronisation n’est pas rétablie.`,
        metadata: { syncSourceId, url: source.url },
      },
    });
  }
}

const syncWorker = new Worker(
  "sync",
  async (job) => {
    const { syncSourceId } = job.data as { syncSourceId: string };
    const source = await prisma.syncSource.findUnique({
      where: { id: syncSourceId },
    });
    if (!source || !source.isActive) return { skipped: true };

    try {
      return await runSyncSource(syncSourceId);
    } catch (err) {
      if (isLastAttempt(job.attemptsMade, job.opts.attempts)) {
        await notifySyncFailure(syncSourceId, err);
      }
      throw err;
    }
  },
  { connection },
);

const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    const { userId, title, message, type, metadata } = job.data;
    await prisma.notification.create({
      data: { userId, title, message, type, metadata },
    });
    return { sent: true };
  },
  { connection },
);

const maintenanceWorker = new Worker(
  "maintenance",
  async (job) => {
    if (job.name === SYNC_TICK_JOB_NAME) {
      return scheduleSyncJobs();
    }
    if (job.name === REMINDER_JOB_NAME) {
      return { reminders: await processRemovalReminders() };
    }
    if (job.name === DEGRADED_JOB_NAME) {
      return checkSyncDegraded();
    }
    return { skipped: true };
  },
  { connection },
);

importWorker.on("completed", (job) =>
  console.log(`Import job ${job.id} completed`),
);
importWorker.on("failed", (job, err) => {
  console.error(`Import job ${job?.id} failed:`, err);
  void captureWorkerException(err);
});
syncWorker.on("completed", (job) =>
  console.log(`Sync job ${job.id} completed`),
);
syncWorker.on("failed", (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err);
  void captureWorkerException(err);
});
maintenanceWorker.on("failed", (job, err) => {
  console.error(`Maintenance job ${job?.id} failed:`, err);
  void captureWorkerException(err);
});

const heartbeatTimer = startWorkerHeartbeat(connection, () =>
  pingUptime(workerHeartbeatUrl()),
);

console.log("Suivia Auto worker started");
console.log("  - Import queue: listening");
console.log("  - Sync queue: listening");
console.log("  - Notification queue: listening");
console.log("  - Maintenance schedulers: tick / reminders / degraded");

export async function scheduleSyncJobs() {
  const sources = await prisma.syncSource.findMany({
    where: { isActive: true },
  });
  let queued = 0;
  for (const source of sources) {
    const lastSync = source.lastSyncAt?.getTime() ?? 0;
    const intervalMs = source.intervalMinutes * 60 * 1000;
    if (Date.now() - lastSync >= intervalMs) {
      try {
        await syncQueue.add(
          SYNC_JOB_NAME,
          { syncSourceId: source.id },
          syncJobOptions(source.id),
        );
        queued += 1;
      } catch (err) {
        if (!isDuplicateJobError(err)) throw err;
      }
    }
  }
  return { queued };
}

async function startSchedulers() {
  await maintenanceQueue.upsertJobScheduler(
    "suivia-sync-tick",
    { every: SYNC_TICK_EVERY_MS },
    { name: SYNC_TICK_JOB_NAME, data: { kind: SYNC_TICK_JOB_NAME } },
  );
  await maintenanceQueue.upsertJobScheduler(
    "suivia-reminders",
    { every: REMINDER_EVERY_MS },
    { name: REMINDER_JOB_NAME, data: { kind: REMINDER_JOB_NAME } },
  );
  await maintenanceQueue.upsertJobScheduler(
    "suivia-degraded",
    { every: DEGRADED_EVERY_MS },
    { name: DEGRADED_JOB_NAME, data: { kind: DEGRADED_JOB_NAME } },
  );
}

void initWorkerSentry();
startSchedulers()
  .then(() => {
    console.log("  - BullMQ job schedulers registered");
    return scheduleSyncJobs();
  })
  .then(() => processRemovalReminders())
  .then(() => checkSyncDegraded())
  .catch(console.error);

process.on("SIGTERM", async () => {
  clearInterval(heartbeatTimer);
  await importWorker.close();
  await syncWorker.close();
  await notificationWorker.close();
  await maintenanceWorker.close();
  await importQueue.close();
  await syncQueue.close();
  await notificationQueue.close();
  await maintenanceQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});
