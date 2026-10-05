import { prisma } from "@okauto/database";
import {
  SYNC_DEGRADED_KIND,
  classifySyncHealth,
  type SyncSourceHealthInput,
} from "@okauto/shared";

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function postSyncAlertWebhook(
  payload: Record<string, unknown>,
  url = process.env.SYNC_ALERT_WEBHOOK_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<"skipped" | "ok" | "error"> {
  const target = url?.trim();
  if (!target) return "skipped";
  try {
    const response = await fetchImpl(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? "ok" : "error";
  } catch (err) {
    console.error("sync alert webhook failed", err);
    return "error";
  }
}

export async function checkSyncDegraded(now = new Date()) {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const day = now.toISOString().slice(0, 10);
  let notified = 0;

  for (const organization of organizations) {
    const [sources, recentRuns] = await Promise.all([
      prisma.syncSource.findMany({
        where: { organizationId: organization.id },
      }),
      prisma.syncRun.findMany({
        where: { organizationId: organization.id },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { status: true },
      }),
    ]);
    const failedRunsLast10 = recentRuns.filter((run) =>
      ["FAILED", "PARTIAL"].includes(run.status),
    ).length;
    const snapshots: SyncSourceHealthInput[] = sources.map((source) => ({
      id: source.id,
      name: source.name,
      isActive: source.isActive,
      intervalMinutes: source.intervalMinutes,
      lastSyncAt: source.lastSyncAt,
      lastSyncStatus: source.lastSyncStatus,
      createdAt: source.createdAt,
    }));
    const health = classifySyncHealth({
      sources: snapshots,
      failedRunsLast10,
      nowMs: now.getTime(),
    });
    if (health.status !== "degraded") continue;

    const existing = await prisma.notification.findMany({
      where: {
        type: "SYSTEM",
        createdAt: { gte: startOfUtcDay(now) },
      },
      select: { metadata: true },
    });
    const already = existing.some((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return (
        metadata.kind === SYNC_DEGRADED_KIND &&
        metadata.organizationId === organization.id &&
        metadata.day === day
      );
    });
    if (already) continue;

    const managers = await prisma.organizationMember.findMany({
      where: {
        organizationId: organization.id,
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
      },
      select: { userId: true },
    });
    const title = "Synchronisation DÉGRADÉE";
    const message = `La synchro de ${organization.name} est dégradée : ${health.reasons.join(" ; ")}. Les retraits et les prix peuvent être en retard.`;
    for (const manager of managers) {
      await prisma.notification.create({
        data: {
          userId: manager.userId,
          type: "SYSTEM",
          title,
          message,
          metadata: {
            kind: SYNC_DEGRADED_KIND,
            organizationId: organization.id,
            day,
            reasons: health.reasons,
            staleSourceIds: health.staleSourceIds,
          },
        },
      });
    }

    await postSyncAlertWebhook({
      kind: SYNC_DEGRADED_KIND,
      organizationId: organization.id,
      organizationName: organization.name,
      status: health.status,
      reasons: health.reasons,
      staleSourceCount: health.staleSourceCount,
      failedRunsLast10: health.failedRunsLast10,
      day,
    });
    notified += 1;
  }

  return { notified };
}
