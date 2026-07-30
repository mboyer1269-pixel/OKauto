import { beforeEach, describe, expect, it } from "vitest";
import type { JobKind } from "@okauto/shared";
import { PgJobQueue } from "../jobs/queue.js";
import { JobWorker, type JobHandler } from "../jobs/worker.js";
import { resetDb, testPrisma } from "./helpers.js";

const prisma = testPrisma();
const queue = new PgJobQueue(prisma, { workerId: "test-worker", lockTtlMs: 60_000, backoffBaseMs: 1000 });

beforeEach(async () => {
  await resetDb();
});

describe("PgJobQueue", () => {
  it("claims pending jobs once (SKIP LOCKED) and marks success", async () => {
    const job = await queue.enqueue("SYNC_SWEEP", { hello: "world" });
    const claimed1 = await queue.claim(["SYNC_SWEEP"]);
    expect(claimed1?.id).toBe(job.id);
    expect(claimed1?.attempts).toBe(1);

    const claimed2 = await queue.claim(["SYNC_SWEEP"]);
    expect(claimed2).toBeNull();

    await queue.succeed(job.id);
    const done = await prisma.job.findUnique({ where: { id: job.id } });
    expect(done?.status).toBe("SUCCEEDED");
  });

  it("dedupeKey makes enqueue idempotent", async () => {
    const first = await queue.enqueue("SYNC_SWEEP", {}, { dedupeKey: "k-1" });
    const second = await queue.enqueue("SYNC_SWEEP", {}, { dedupeKey: "k-1" });
    expect(second.id).toBe(first.id);
    expect(await prisma.job.count()).toBe(1);
  });

  it("fail schedules retry with backoff, then moves to DEAD at max attempts", async () => {
    const job = await queue.enqueue("SYNC_SWEEP", {}, { maxAttempts: 2 });
    await queue.claim(["SYNC_SWEEP"]);
    const first = await queue.fail(job.id, new Error("boom"));
    expect(first.retried).toBe(true);
    const afterFirst = await prisma.job.findUnique({ where: { id: job.id } });
    expect(afterFirst?.status).toBe("PENDING");
    expect(afterFirst!.runAt.getTime()).toBeGreaterThan(Date.now() + 500); // backoff applied
    expect(afterFirst?.lastError).toContain("boom");

    // Force runAt to now and fail again → attempts (2) >= maxAttempts (2) → DEAD.
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await queue.claim(["SYNC_SWEEP"]);
    const second = await queue.fail(job.id, new Error("boom again"));
    expect(second.retried).toBe(false);
    const dead = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dead?.status).toBe("DEAD");
  });

  it("reclaims stale RUNNING locks", async () => {
    const job = await queue.enqueue("SYNC_SWEEP", {});
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", lockedAt: new Date(Date.now() - 120_000), lockedBy: "dead-worker" },
    });
    const reclaimed = await queue.claim(["SYNC_SWEEP"]);
    expect(reclaimed?.id).toBe(job.id);
  });

  it("worker executes handlers and records outcomes", async () => {
    const executed: string[] = [];
    const handlers = new Map<JobKind, JobHandler>();
    handlers.set("SYNC_SWEEP", async (job) => {
      executed.push(String(job.id));
    });
    const worker = new JobWorker(queue, handlers, {
      pollMs: 50,
      concurrency: 2,
      logger: { info: () => undefined, error: () => undefined },
    });

    const job = await queue.enqueue("SYNC_SWEEP", {});
    const claimed = await worker.pump();
    expect(claimed).toBe(1);
    await worker.stop(); // drains in-flight
    expect(executed).toEqual([job.id]);
    expect((await prisma.job.findUnique({ where: { id: job.id } }))?.status).toBe("SUCCEEDED");
  });

  it("worker moves permanently-failing jobs to DEAD after max attempts", async () => {
    const handlers = new Map<JobKind, JobHandler>();
    handlers.set("SYNC_SWEEP", async () => {
      throw new Error("always fails");
    });
    const worker = new JobWorker(queue, handlers, {
      pollMs: 50,
      concurrency: 1,
      logger: { info: () => undefined, error: () => undefined },
    });
    const job = await queue.enqueue("SYNC_SWEEP", {}, { maxAttempts: 1 });
    await worker.pump();
    await worker.stop();
    const after = await prisma.job.findUnique({ where: { id: job.id } });
    expect(after?.status).toBe("DEAD");
    expect(after?.lastError).toContain("always fails");
  });

  it("claim with an empty kind set returns null", async () => {
    await queue.enqueue("SYNC_SWEEP", {});
    expect(await queue.claim([])).toBeNull();
  });
});
