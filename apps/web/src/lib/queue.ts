import { Queue } from "bullmq";
import IORedis from "ioredis";

let syncQueue: Queue | null = null;
let connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
      },
    );
  }
  return connection;
}

export function getSyncQueue(): Queue {
  if (!syncQueue) {
    syncQueue = new Queue("sync", { connection: getConnection() });
  }
  return syncQueue;
}

export async function enqueueSyncJob(syncSourceId: string): Promise<string> {
  const job = await getSyncQueue().add(
    "sync",
    { syncSourceId },
    {
      jobId: `sync-${syncSourceId}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  return job.id ?? syncSourceId;
}
