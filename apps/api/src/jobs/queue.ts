import type { Job, JobStatus, Prisma, PrismaClient } from "@okauto/db";
import { JOB_BACKOFF_BASE_MS, JOB_DEFAULT_MAX_ATTEMPTS } from "@okauto/shared";
import { createHash } from "node:crypto";

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** Idempotency key; re-enqueueing with the same key returns the existing job. */
  dedupeKey?: string;
}

export interface QueueOptions {
  workerId: string;
  lockTtlMs: number;
  backoffBaseMs?: number;
}

/**
 * Postgres-backed job queue. Claiming uses SELECT ... FOR UPDATE SKIP LOCKED so
 * multiple workers can compete safely with no external infrastructure.
 * Jobs are expected to be idempotent (handlers use natural keys / upserts).
 */
export class PgJobQueue {
  constructor(
    private readonly db: PrismaClient,
    private readonly opts: QueueOptions,
  ) {}

  async enqueue(kind: string, payload: Prisma.InputJsonValue, options: EnqueueOptions = {}): Promise<Job> {
    if (options.dedupeKey) {
      const existing = await this.db.job.findUnique({ where: { dedupeKey: options.dedupeKey } });
      if (existing && existing.status !== "FAILED" && existing.status !== "DEAD" && existing.status !== "SUCCEEDED") {
        return existing;
      }
      if (existing) await this.db.job.delete({ where: { id: existing.id } }).catch(() => undefined);
    }
    return this.db.job.create({
      data: {
        kind,
        payload,
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? JOB_DEFAULT_MAX_ATTEMPTS,
        dedupeKey: options.dedupeKey ?? null,
      },
    });
  }

  /** Claims the next runnable job, or null. Also reclaims stale RUNNING locks. */
  async claim(kinds: string[]): Promise<Job | null> {
    if (kinds.length === 0) return null;
    const staleBefore = new Date(Date.now() - this.opts.lockTtlMs);
    await this.db.job.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: staleBefore } },
      data: { status: "PENDING", lockedAt: null, lockedBy: null },
    });

    const claimed = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Job"
        WHERE "status" = 'PENDING' AND "runAt" <= now() AND "kind" = ANY(${kinds})
        ORDER BY "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const id = rows[0]?.id;
      if (!id) return null;
      return tx.job.update({
        where: { id },
        data: {
          status: "RUNNING",
          lockedAt: new Date(),
          lockedBy: this.opts.workerId,
          attempts: { increment: 1 },
        },
      });
    });
    return claimed;
  }

  async succeed(id: string): Promise<void> {
    await this.db.job.update({
      where: { id },
      data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null, lastError: null },
    });
  }

  async complete(id: string): Promise<void> {
    return this.succeed(id);
  }

  /** Marks failure; schedules retry with exponential backoff + jitter, or moves to DEAD. */
  async fail(id: string, error: unknown): Promise<{ retried: boolean; status: JobStatus }> {
    const job = await this.db.job.findUniqueOrThrow({ where: { id } });
    const message = error instanceof Error ? error.message.slice(0, 2000) : "unknown error";
    if (job.attempts >= job.maxAttempts) {
      await this.db.job.update({
        where: { id },
        data: { status: "DEAD", lastError: message, lockedAt: null, lockedBy: null },
      });
      return { retried: false, status: "DEAD" };
    }
    const base = this.opts.backoffBaseMs ?? JOB_BACKOFF_BASE_MS;
    const backoff = base * 2 ** Math.max(0, job.attempts - 1);
    const jitter = Math.floor(Math.random() * base);
    await this.db.job.update({
      where: { id },
      data: {
        status: "PENDING",
        runAt: new Date(Date.now() + backoff + jitter),
        lastError: message,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return { retried: true, status: "PENDING" };
  }

  async requeue(id: string): Promise<Job> {
    return this.db.job.update({
      where: { id },
      data: { status: "PENDING", runAt: new Date(), attempts: 0, lockedAt: null, lockedBy: null, lastError: null },
    });
  }

  static dedupeHash(parts: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40);
  }
}
