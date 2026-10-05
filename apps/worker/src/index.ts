import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@okauto/database";
import { runSyncSource } from "./sync.js";
import { processRemovalReminders } from "./reminders.js";
import { startWorkerHeartbeat } from "./heartbeat.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const importQueue = new Queue("import", { connection });
export const syncQueue = new Queue("sync", { connection });
export const notificationQueue = new Queue("notifications", { connection });

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

const syncWorker = new Worker(
  "sync",
  async (job) => {
    const { syncSourceId } = job.data as { syncSourceId: string };
    const source = await prisma.syncSource.findUnique({
      where: { id: syncSourceId },
    });
    if (!source || !source.isActive) return { skipped: true };

    try {
      const result = await runSyncSource(syncSourceId);
      return result;
    } catch (err) {
      const source = await prisma.syncSource.findUnique({
        where: { id: syncSourceId },
      });
      if (!source) throw err;

      const managers = await prisma.organizationMember.findMany({
        where: {
          organizationId: source.organizationId,
          role: { in: ["OWNER", "ADMIN", "MANAGER"] },
        },
        select: { userId: true },
      });
      for (const m of managers) {
        await prisma.notification.create({
          data: {
            userId: m.userId,
            type: "SYNC_ERROR",
            title: `Synchronisation en échec : ${source.name}`,
            message: `${err instanceof Error ? err.message : "Erreur inconnue"}. Les retraits et les prix ne sont pas à jour tant que la synchronisation n’est pas rétablie.`,
            metadata: { syncSourceId, url: source.url },
          },
        });
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

importWorker.on("completed", (job) =>
  console.log(`Import job ${job.id} completed`),
);
importWorker.on("failed", (job, err) =>
  console.error(`Import job ${job?.id} failed:`, err),
);
syncWorker.on("completed", (job) =>
  console.log(`Sync job ${job.id} completed`),
);
syncWorker.on("failed", (job, err) =>
  console.error(`Sync job ${job?.id} failed:`, err),
);

const heartbeatTimer = startWorkerHeartbeat(connection);

console.log("Suivia Auto worker started");
console.log("  - Import queue: listening");
console.log("  - Sync queue: listening");
console.log("  - Notification queue: listening");

async function scheduleSyncJobs() {
  const sources = await prisma.syncSource.findMany({
    where: { isActive: true },
  });
  for (const source of sources) {
    const lastSync = source.lastSyncAt?.getTime() ?? 0;
    const intervalMs = source.intervalMinutes * 60 * 1000;
    if (Date.now() - lastSync >= intervalMs) {
      await syncQueue.add(
        "sync",
        { syncSourceId: source.id },
        {
          jobId: `sync-${source.id}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }
}

setInterval(scheduleSyncJobs, 5 * 60 * 1000);
scheduleSyncJobs().catch(console.error);
setInterval(() => {
  processRemovalReminders().catch(console.error);
}, 60 * 60 * 1000);
processRemovalReminders().catch(console.error);

process.on("SIGTERM", async () => {
  clearInterval(heartbeatTimer);
  await importWorker.close();
  await syncWorker.close();
  await notificationWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
