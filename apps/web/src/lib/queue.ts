import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  SYNC_JOB_NAME,
  isDuplicateJobError,
  syncJobOptions,
} from "@okauto/shared";

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
  try {
    const job = await getSyncQueue().add(
      SYNC_JOB_NAME,
      { syncSourceId },
      syncJobOptions(syncSourceId),
    );
    return job.id ?? syncSourceId;
  } catch (err) {
    if (isDuplicateJobError(err)) return syncSourceId;
    throw err;
  }
}
