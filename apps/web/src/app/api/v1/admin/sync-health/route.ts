import { prisma } from "@okauto/database";
import { withAuth, jsonResponse } from "@/lib/api";

export const GET = withAuth(async (_request, { auth }) => {
  const [sources, recentRuns, pendingFeedReview] = await Promise.all([
    prisma.syncSource.findMany({
      where: { organizationId: auth.orgId },
      orderBy: { name: "asc" },
    }),
    prisma.syncRun.findMany({
      where: { organizationId: auth.orgId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { syncSource: { select: { name: true } } },
    }),
    prisma.vehicle.count({
      where: {
        organizationId: auth.orgId,
        status: { in: ["AVAILABLE", "PENDING"] },
        feedAbsenceStatus: "PENDING_REVIEW",
      },
    }),
  ]);

  const failedRuns = recentRuns.filter((run) =>
    ["FAILED", "PARTIAL"].includes(run.status),
  ).length;
  const sourceErrors = sources.filter((source) =>
    ["error", "failed", "partial"].includes(source.lastSyncStatus ?? ""),
  ).length;
  const lastSync = sources.reduce<Date | null>((latest, s) => {
    if (!s.lastSyncAt) return latest;
    return !latest || s.lastSyncAt > latest ? s.lastSyncAt : latest;
  }, null);

  return jsonResponse({
    sources,
    recentRuns,
    pendingFeedReview,
    health: {
      sourceCount: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      failedRunsLast10: failedRuns,
      lastSyncAt: lastSync,
      pendingFeedReview,
      status:
        failedRuns > 0 || sourceErrors > 0
          ? "degraded"
          : pendingFeedReview > 0
            ? "review"
            : sources.length === 0
              ? "no_sources"
              : "healthy",
    },
  });
});
