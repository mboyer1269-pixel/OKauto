export const SYNC_JOB_NAME = "sync";
export const SYNC_TICK_JOB_NAME = "tick";
export const REMINDER_JOB_NAME = "reminders";
export const DEGRADED_JOB_NAME = "degraded";
export const VIN_DECODE_JOB_NAME = "vin-decode";
export const ACCESS_REQUEST_RETENTION_JOB_NAME = "access-request-retention";

/** Loi 25: erase stored IP after 30 days. */
export const ACCESS_REQUEST_IP_RETENTION_DAYS = 30;
/** Loi 25: delete the access-request row after 12 months. */
export const ACCESS_REQUEST_RETENTION_MONTHS = 12;
export const ACCESS_REQUEST_RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

export function accessRequestIpCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - ACCESS_REQUEST_IP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function accessRequestRecordCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ACCESS_REQUEST_RETENTION_MONTHS);
  return cutoff;
}

export const SYNC_JOB_ATTEMPTS = 3;
export const SYNC_JOB_BACKOFF_MS = 5_000;
export const SYNC_TICK_EVERY_MS = 5 * 60 * 1000;
export const REMINDER_EVERY_MS = 60 * 60 * 1000;
export const DEGRADED_EVERY_MS = 15 * 60 * 1000;
/** Catch-up / post-sync VIN decode. One vPIC call per second, 50 NIV per run. */
export const VIN_DECODE_EVERY_MS = 60 * 1000;
export const VIN_DECODE_BATCH_SIZE = 50;
export const VIN_DECODE_GAP_MS = 1_100;
/** Give up after this many retryable vPIC failures and stamp the NIV. */
export const VIN_DECODE_MAX_ATTEMPTS = 5;
/** Stop the current batch so a network outage does not monopolize the queue. */
export const VIN_DECODE_CONSECUTIVE_NETWORK_STOP = 3;
/** Wall-clock wait after the 1st–4th retryable failure (then abandon on the 5th). */
export const VIN_DECODE_RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

export function vinDecodeRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const index = Math.min(attempts, VIN_DECODE_RETRY_DELAYS_MS.length) - 1;
  return VIN_DECODE_RETRY_DELAYS_MS[index];
}

export function vinDecodeReadyForRetry(
  attempts: number,
  lastAttemptAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!attempts || attempts <= 0) return true;
  if (!lastAttemptAt) return true;
  const last =
    lastAttemptAt instanceof Date
      ? lastAttemptAt.getTime()
      : new Date(lastAttemptAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= vinDecodeRetryDelayMs(attempts);
}

export function vinDecodeBackoffWhere(now: Date = new Date()) {
  const due = (attempts: number) => ({
    vinDecodeAttempts: attempts,
    vinDecodeLastAttemptAt: {
      lte: new Date(now.getTime() - vinDecodeRetryDelayMs(attempts)),
    },
  });
  return {
    OR: [
      { vinDecodeAttempts: { lte: 0 } },
      { vinDecodeLastAttemptAt: null },
      due(1),
      due(2),
      due(3),
      due(4),
    ],
  };
}

export function shouldLogVinDecodeJobComplete(result?: {
  scanned?: number;
} | null): boolean {
  return Boolean(result && (result.scanned ?? 0) > 0);
}

export const DEFAULT_SYNC_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_SYNC_FETCH_MAX_BYTES = 8 * 1024 * 1024;

export function syncJobId(syncSourceId: string): string {
  return `sync-${syncSourceId}`;
}

/** In-flight only. Do not set `jobId` — completed jobs would block later adds. */
export function syncJobOptions(syncSourceId: string) {
  return {
    deduplication: { id: syncJobId(syncSourceId) },
    attempts: SYNC_JOB_ATTEMPTS,
    backoff: { type: "exponential" as const, delay: SYNC_JOB_BACKOFF_MS },
    removeOnComplete: { count: 50, age: 7 * 24 * 3600 },
    removeOnFail: { count: 100, age: 30 * 24 * 3600 },
  };
}

export const MAINTENANCE_JOB_OPTS = {
  removeOnComplete: { count: 100 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function vinDecodeJobOptions() {
  return {
    deduplication: { id: VIN_DECODE_JOB_NAME, ttl: 50_000 },
    attempts: 1,
    ...MAINTENANCE_JOB_OPTS,
  };
}

export function isLastAttempt(
  attemptsMade: number,
  attempts?: number | null,
): boolean {
  return attemptsMade + 1 >= (attempts ?? 1);
}

export function isDuplicateJobError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already (exists|used)|duplicat/i.test(message);
}

export type EnvMap = Record<string, string | undefined>;

export function readEnv(env?: EnvMap): EnvMap {
  if (env) return env;
  const runtime = globalThis as { process?: { env?: EnvMap } };
  return runtime.process?.env ?? {};
}

export function syncFetchLimits(env?: EnvMap): {
  timeoutMs: number;
  maxBytes: number;
} {
  env = readEnv(env);
  const timeoutMs = Number(env.SYNC_FETCH_TIMEOUT_MS);
  const maxBytes = Number(env.SYNC_FETCH_MAX_BYTES);
  return {
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_SYNC_FETCH_TIMEOUT_MS,
    maxBytes:
      Number.isFinite(maxBytes) && maxBytes > 0
        ? maxBytes
        : DEFAULT_SYNC_FETCH_MAX_BYTES,
  };
}
