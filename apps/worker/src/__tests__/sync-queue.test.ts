import { afterAll, describe, expect, it } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { SYNC_JOB_NAME, syncJobOptions } from "@okauto/shared";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

describe("sync job enqueue after completion", () => {
  const queueName = `sync-readd-${process.pid}-${Date.now()}`;
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const eventsConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(queueName, { connection });
  const events = new QueueEvents(queueName, { connection: eventsConnection });
  const processed: string[] = [];

  const worker = new Worker(
    queueName,
    async (job) => {
      processed.push(String((job.data as { syncSourceId: string }).syncSourceId));
      return { ok: true };
    },
    { connection, concurrency: 1 },
  );

  afterAll(async () => {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    await connection.quit();
    await eventsConnection.quit();
  });

  it("runs two successive enqueues for the same source", async () => {
    await Promise.all([
      worker.waitUntilReady(),
      events.waitUntilReady(),
      queue.waitUntilReady(),
    ]);

    const sourceId = "src-readd-1";
    const first = await queue.add(
      SYNC_JOB_NAME,
      { syncSourceId: sourceId },
      syncJobOptions(sourceId),
    );
    await first.waitUntilFinished(events);
    expect(await first.getState()).toBe("completed");
    expect(processed).toEqual([sourceId]);

    const second = await queue.add(
      SYNC_JOB_NAME,
      { syncSourceId: sourceId },
      syncJobOptions(sourceId),
    );
    expect(second.id).not.toBe(first.id);
    await second.waitUntilFinished(events);
    expect(await second.getState()).toBe("completed");
    expect(processed).toEqual([sourceId, sourceId]);
  });
});
