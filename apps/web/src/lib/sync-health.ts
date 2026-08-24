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
  recentJobs: Array<{
    id: string;
    status: string;
    source: string;
    successCount: number;
    errorCount: number;
    createdAt: string;
    user: { name: string };
  }>;
  health: {
    status: string;
    sourceCount: number;
    activeSources: number;
    failedJobsLast10: number;
    lastSyncAt: string | null;
  };
}

export function isSyncHealthData(value: unknown): value is SyncHealthData {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SyncHealthData>;
  if (!Array.isArray(candidate.sources) || !Array.isArray(candidate.recentJobs))
    return false;
  if (!candidate.health || typeof candidate.health !== "object") return false;

  return (
    typeof candidate.health.status === "string" &&
    typeof candidate.health.sourceCount === "number" &&
    typeof candidate.health.activeSources === "number" &&
    typeof candidate.health.failedJobsLast10 === "number" &&
    (candidate.health.lastSyncAt === null ||
      typeof candidate.health.lastSyncAt === "string")
  );
}
