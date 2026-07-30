import { prisma } from '@okauto/database';
import { withAuth, jsonResponse } from '@/lib/api';

export const GET = withAuth(async (_request, { auth }) => {
  const sources = await prisma.syncSource.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { name: 'asc' },
  });

  const recentJobs = await prisma.importJob.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  const failedJobs = recentJobs.filter((j) => j.status === 'FAILED' || j.status === 'PARTIAL').length;
  const lastSync = sources.reduce<Date | null>((latest, s) => {
    if (!s.lastSyncAt) return latest;
    return !latest || s.lastSyncAt > latest ? s.lastSyncAt : latest;
  }, null);

  return jsonResponse({
    sources,
    recentJobs,
    health: {
      sourceCount: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      failedJobsLast10: failedJobs,
      lastSyncAt: lastSync,
      status: failedJobs > 0 ? 'degraded' : sources.length === 0 ? 'no_sources' : 'healthy',
    },
  });
});
