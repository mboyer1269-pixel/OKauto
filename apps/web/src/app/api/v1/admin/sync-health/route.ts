import { prisma } from "@okauto/database";
import { withAuth, jsonResponse } from "@/lib/api";

export const GET = withAuth(async (_request, { auth }) => {
  const sources = await prisma.syncSource.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { name: "asc" },
  });

  const recentRuns = await prisma.syncRun.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { startedAt: "desc" },
    take: 10,
    include: { syncSource: { select: { name: true } } },
  });

  const failedRuns = recentRuns.filter((run) =>
    ["FAILED", "PARTIAL", "DEGRADED"].includes(run.status),
  ).length;
  const sourceErrors = sources.filter((source) =>
    ["error", "failed", "partial", "degraded"].includes(
      source.lastSyncStatus ?? "",
    ),
  ).length;
  const lastSync = sources.reduce<Date | null>((latest, s) => {
    if (!s.lastSyncAt) return latest;
    return !latest || s.lastSyncAt > latest ? s.lastSyncAt : latest;
  }, null);

  return jsonResponse({
    sources,
    recentRuns,
    health: {
      sourceCount: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      failedRunsLast10: failedRuns,
      lastSyncAt: lastSync,
      status:
        failedRuns > 0 || sourceErrors > 0
          ? "degraded"
          : sources.length === 0
            ? "no_sources"
            : "healthy",
    },
  });
});
