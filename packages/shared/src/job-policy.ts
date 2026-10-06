export const SYNC_JOB_NAME = "sync";
export const SYNC_TICK_JOB_NAME = "tick";
export const REMINDER_JOB_NAME = "reminders";
export const DEGRADED_JOB_NAME = "degraded";

export const SYNC_JOB_ATTEMPTS = 3;
export const SYNC_JOB_BACKOFF_MS = 5_000;
export const SYNC_TICK_EVERY_MS = 5 * 60 * 1000;
export const REMINDER_EVERY_MS = 60 * 60 * 1000;
export const DEGRADED_EVERY_MS = 15 * 60 * 1000;

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
