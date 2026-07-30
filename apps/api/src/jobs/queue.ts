import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobs } from "../db/schema.js";

/**
 * Minimal, dependency-free Postgres-backed job queue.
 *
 * - `FOR UPDATE SKIP LOCKED` claiming supports multiple worker processes.
 * - Exponential backoff retries up to `maxAttempts`, then DEAD (dead-letter).
 * - Optional `dedupeKey` prevents duplicate pending jobs (e.g. one pending
 *   feed sync per feed source).
 */

export type JobType =
  | "feed_sync"
  | "csv_import"
  | "sold_alerts"
  | "price_change_alerts"
  | "generate_description"
  | "stale_listing_scan"
  | "feed_schedule_tick";

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
}

export async function enqueueJob(
  db: Db,
  type: JobType,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<string | null> {
  if (opts.dedupeKey) {
    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.dedupeKey, opts.dedupeKey), inArray(jobs.status, ["PENDING", "RUNNING"])))
      .limit(1);
    if (existing.length > 0) return null;
  }
  const [row] = await db
    .insert(jobs)
    .values({
      type,
      payload,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      dedupeKey: opts.dedupeKey ?? null,
    })
    .returning({ id: jobs.id });
  return row?.id ?? null;
}

export type JobRow = typeof jobs.$inferSelect;

/** Claim the next runnable job (safe across concurrent workers). */
export async function claimNextJob(db: Db): Promise<JobRow | null> {
  const now = new Date();
  const claimed = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "PENDING"), lte(jobs.runAt, now)))
      .orderBy(asc(jobs.runAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;
    const [updated] = await tx
      .update(jobs)
      .set({ status: "RUNNING", attempts: candidate.attempts + 1, updatedAt: new Date() })
      .where(eq(jobs.id, candidate.id))
      .returning();
    return updated ?? null;
  });
  return claimed;
}

export async function completeJob(db: Db, jobId: string): Promise<void> {
  await db.update(jobs).set({ status: "SUCCEEDED", updatedAt: new Date() }).where(eq(jobs.id, jobId));
}

export function backoffDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 1000 * 2 ** attempts); // 2s, 4s, 8s... capped at 1h
}

export async function failJob(db: Db, job: JobRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}`.slice(0, 4000) : String(error);
  if (job.attempts >= job.maxAttempts) {
    await db
      .update(jobs)
      .set({ status: "DEAD", lastError: message, updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
  } else {
    await db
      .update(jobs)
      .set({
        status: "PENDING",
        lastError: message,
        runAt: new Date(Date.now() + backoffDelayMs(job.attempts)),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
  }
}

export async function queueDepth(db: Db): Promise<{ pending: number; running: number; dead: number }> {
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  return {
    pending: byStatus.PENDING ?? 0,
    running: byStatus.RUNNING ?? 0,
    dead: byStatus.DEAD ?? 0,
  };
}
