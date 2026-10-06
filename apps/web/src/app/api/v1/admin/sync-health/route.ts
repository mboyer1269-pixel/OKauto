import { prisma } from "@okauto/database";
import { classifySyncHealth } from "@okauto/shared";
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
  const lastSync = sources.reduce<Date | null>((latest, s) => {
    if (!s.lastSyncAt) return latest;
    return !latest || s.lastSyncAt > latest ? s.lastSyncAt : latest;
  }, null);
  const classified = classifySyncHealth({
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      isActive: source.isActive,
      intervalMinutes: source.intervalMinutes,
      lastSyncAt: source.lastSyncAt,
      lastSyncStatus: source.lastSyncStatus,
      createdAt: source.createdAt,
    })),
    failedRunsLast10: failedRuns,
    pendingFeedReview,
  });

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
      status: classified.status,
      reasons: classified.reasons,
      staleSourceCount: classified.staleSourceCount,
    },
  });
});
