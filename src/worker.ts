import { and, asc, eq, lte } from "drizzle-orm";
import { Worker } from "bullmq";

import { db } from "@/db";
import { outboxEvents } from "@/db/schema";
import { redis } from "@/lib/queue";

const worker = new Worker(
  "driveflow-operations",
  async (job) => {
    if (job.name !== "outbox-sweep") throw new Error(`Unsupported job ${job.name}`);
    const events = await db()
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, "PENDING"), lte(outboxEvents.availableAt, new Date())))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(100);

    for (const event of events) {
      const claimed = await db()
        .update(outboxEvents)
        .set({ status: "PROCESSING", attempts: event.attempts + 1 })
        .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, "PENDING")))
        .returning({ id: outboxEvents.id });
      if (!claimed.length) continue;

      // In-app notifications are committed in the same domain transaction.
      // External providers subscribe here; successful no-provider delivery is
      // intentional and observable rather than a fake network send.
      console.info(JSON.stringify({ level: "info", event: event.topic, outboxId: event.id }));
      await db().update(outboxEvents).set({ status: "DELIVERED" }).where(eq(outboxEvents.id, event.id));
    }
    return { processed: events.length };
  },
  { connection: redis(), concurrency: 5 },
);

worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ level: "error", jobId: job?.id, message: error.message }));
});

const timer = setInterval(() => {
  void import("@/lib/queue").then(({ enqueueOutboxSweep }) => enqueueOutboxSweep());
}, 30_000);

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await worker.close();
  await redis().quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

console.info(JSON.stringify({ level: "info", message: "DriveFlow worker ready" }));
