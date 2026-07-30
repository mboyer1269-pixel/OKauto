import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "@/lib/env";

const globalQueue = globalThis as unknown as {
  redis?: IORedis;
  operationsQueue?: Queue;
};

export function redis(): IORedis {
  globalQueue.redis ??= new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  return globalQueue.redis;
}

export function operationsQueue(): Queue {
  globalQueue.operationsQueue ??= new Queue("driveflow-operations", {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  return globalQueue.operationsQueue;
}

export async function enqueueOutboxSweep(): Promise<void> {
  await operationsQueue().add("outbox-sweep", {}, { jobId: `outbox-${Math.floor(Date.now() / 30_000)}` });
}
