import { Queue } from "bullmq";
import { Redis } from "ioredis";

let connection: Redis | null = null;
let inventoryQueue: Queue | null = null;

export function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function getInventoryQueue(): Queue {
  if (!inventoryQueue) {
    inventoryQueue = new Queue("okauto-inventory", {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return inventoryQueue;
}

export async function enqueueInventorySync(orgId: string, sourceId?: string) {
  const queue = getInventoryQueue();
  await queue.add(
    "sync",
    { orgId, sourceId },
    { jobId: `sync-${orgId}-${sourceId ?? "all"}-${Date.now()}` },
  );
}

export async function enqueueSoldDetection(orgId: string) {
  const queue = getInventoryQueue();
  await queue.add("detect-sold", { orgId });
}
