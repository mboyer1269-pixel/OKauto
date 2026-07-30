import { prisma } from "@lotpilot/db";
import { SourcesManager } from "@/components/sources-manager";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function SourcesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgPage(orgId, "MANAGER");

  const sources = await prisma.inventorySource.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { vehicles: true } },
      syncRuns: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });

  return (
    <SourcesManager
      orgId={orgId}
      sources={sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        status: s.status,
        scheduleMinutes: s.scheduleMinutes,
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
        nextSyncAt: s.nextSyncAt?.toISOString() ?? null,
        lastError: s.lastError,
        vehicleCount: s._count.vehicles,
        recentRuns: s.syncRuns.map((r) => ({
          id: r.id,
          status: r.status,
          trigger: r.trigger,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt?.toISOString() ?? null,
          stats: r.stats as Record<string, unknown>,
          error: r.error,
        })),
      }))}
    />
  );
}
