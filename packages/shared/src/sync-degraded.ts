import { readEnv } from "./job-policy";

export type SyncHealthStatus =
  | "healthy"
  | "degraded"
  | "review"
  | "no_sources";

export interface SyncSourceHealthInput {
  id?: string;
  name?: string;
  isActive: boolean;
  intervalMinutes: number;
  lastSyncAt: Date | string | null;
  lastSyncStatus: string | null;
  createdAt?: Date | string | null;
}

export interface SyncHealthClassification {
  status: SyncHealthStatus;
  failedRunsLast10: number;
  sourceErrors: number;
  staleSourceCount: number;
  staleSourceIds: string[];
  reasons: string[];
}

const ERROR_STATUSES = new Set(["error", "failed", "partial"]);

function asTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isStaleSyncSource(
  source: SyncSourceHealthInput,
  nowMs = Date.now(),
): boolean {
  if (!source.isActive) return false;
  const windowMs = Math.max(1, source.intervalMinutes) * 60 * 1000 * 2;
  const last = asTime(source.lastSyncAt);
  if (last != null) return nowMs - last > windowMs;
  const created = asTime(source.createdAt);
  if (created != null) return nowMs - created > windowMs;
  return false;
}

export function classifySyncHealth(input: {
  sources: SyncSourceHealthInput[];
  failedRunsLast10: number;
  pendingFeedReview?: number;
  nowMs?: number;
}): SyncHealthClassification {
  const nowMs = input.nowMs ?? Date.now();
  const sourceErrors = input.sources.filter(
    (source) =>
      source.isActive &&
      ERROR_STATUSES.has((source.lastSyncStatus ?? "").toLowerCase()),
  ).length;
  const stale = input.sources.filter((source) =>
    isStaleSyncSource(source, nowMs),
  );
  const reasons: string[] = [];
  if (input.failedRunsLast10 > 0) {
    reasons.push(`${input.failedRunsLast10} failed/partial run(s) in last 10`);
  }
  if (sourceErrors > 0) {
    reasons.push(`${sourceErrors} source(s) in error/partial`);
  }
  if (stale.length > 0) {
    reasons.push(
      `${stale.length} active source(s) stale (> 2× intervalMinutes)`,
    );
  }

  let status: SyncHealthStatus;
  if (reasons.length > 0) {
    status = "degraded";
  } else if ((input.pendingFeedReview ?? 0) > 0) {
    status = "review";
  } else if (input.sources.length === 0) {
    status = "no_sources";
  } else {
    status = "healthy";
  }

  return {
    status,
    failedRunsLast10: input.failedRunsLast10,
    sourceErrors,
    staleSourceCount: stale.length,
    staleSourceIds: stale
      .map((source) => source.id)
      .filter((id): id is string => Boolean(id)),
    reasons,
  };
}

export const SYNC_DEGRADED_KIND = "sync_degraded";

export function isSyncDegradedAlertsEnabled(
  env?: Record<string, string | undefined>,
): boolean {
  const raw = (env ?? readEnv()).SYNC_DEGRADED_ALERTS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
