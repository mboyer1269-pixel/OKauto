export interface SyncSource {
  id: string;
  name: string;
  url: string;
  adapter: string;
  isActive: boolean;
  intervalMinutes: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface SyncHealthData {
  sources: SyncSource[];
  recentRuns: Array<{
    id: string;
    status: string;
    receivedCount: number;
    successCount: number;
    errorCount: number;
    soldCount: number;
    durationMs: number | null;
    error: string | null;
    startedAt: string;
    syncSource: { name: string };
  }>;
  pendingFeedReview?: number;
  health: {
    status: string;
    sourceCount: number;
    activeSources: number;
    failedRunsLast10: number;
    lastSyncAt: string | null;
    pendingFeedReview?: number;
  };
}

export function isSyncHealthData(value: unknown): value is SyncHealthData {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SyncHealthData>;
  if (!Array.isArray(candidate.sources) || !Array.isArray(candidate.recentRuns))
    return false;
  if (!candidate.health || typeof candidate.health !== "object") return false;

  return (
    typeof candidate.health.status === "string" &&
    typeof candidate.health.sourceCount === "number" &&
    typeof candidate.health.activeSources === "number" &&
    typeof candidate.health.failedRunsLast10 === "number" &&
    (candidate.health.lastSyncAt === null ||
      typeof candidate.health.lastSyncAt === "string")
  );
}
