/**
 * Postgres-backed job queue. Zero-infra for local/dev; the same interface can be backed
 * by BullMQ/Redis for scale. Jobs are claimed with a short lock, retried with backoff,
 * and moved to DEAD after maxAttempts.
 */
import { prisma, type Job } from '@okauto/db';
import { logger } from './logger';
import { markVehicleSold, repriceVehicle } from './services/listings';

export type JobType = 'vehicle.sold' | 'vehicle.reprice' | 'inventory.sync' | 'noop';

export interface JobPayloads {
  'vehicle.sold': { vehicleId: string };
  'vehicle.reprice': { vehicleId: string; priceCents: number };
  'inventory.sync': { organizationId: string };
  noop: Record<string, never>;
}

export async function enqueue<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  options: { organizationId?: string; runAfter?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type,
      payload: payload as object,
      organizationId: options.organizationId,
      runAfter: options.runAfter ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
    },
  });
  return job.id;
}

const LOCK_TIMEOUT_MS = 60_000;

/** Claim one runnable job atomically-ish (best effort with a lock timestamp). */
export async function claimNextJob(): Promise<Job | null> {
  const now = new Date();
  const staleLock = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const candidate = await prisma.job.findFirst({
    where: {
      status: { in: ['QUEUED', 'RUNNING'] },
      runAfter: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }],
    },
    orderBy: { runAfter: 'asc' },
  });
  if (!candidate) return null;

  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, updatedAt: candidate.updatedAt },
    data: { status: 'RUNNING', lockedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null; // lost the race
  return prisma.job.findUnique({ where: { id: candidate.id } });
}

async function runJob(job: Job): Promise<void> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  switch (job.type) {
    case 'vehicle.sold':
      await markVehicleSold(String(payload.vehicleId));
      return;
    case 'vehicle.reprice':
      await repriceVehicle(String(payload.vehicleId), Number(payload.priceCents));
      return;
    case 'inventory.sync':
    case 'noop':
      return;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/** Process a single job if available. Returns true if a job was handled. */
export async function processOne(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    await runJob(job);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'SUCCEEDED', lockedAt: null, lastError: null },
    });
    logger.info('Job succeeded', { jobId: job.id, type: job.type });
  } catch (error) {
    const dead = job.attempts >= job.maxAttempts;
    const backoffMs = Math.min(2 ** job.attempts * 1000, 60_000);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: dead ? 'DEAD' : 'QUEUED',
        lockedAt: null,
        lastError: String(error),
        runAfter: new Date(Date.now() + backoffMs),
      },
    });
    logger.error('Job failed', { jobId: job.id, type: job.type, dead, error: String(error) });
  }
  return true;
}

/** Drain up to `max` ready jobs (used by the /api/worker/tick endpoint and worker loop). */
export async function drain(max = 25): Promise<number> {
  let processed = 0;
  while (processed < max) {
    const handled = await processOne();
    if (!handled) break;
    processed += 1;
  }
  return processed;
}
