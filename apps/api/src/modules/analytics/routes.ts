import type { FastifyInstance } from "fastify";
import { analyticsQuerySchema } from "@okauto/shared";

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get("/analytics/overview", { preHandler: [app.requireOrg("analytics:read")] }, async (request) => {
    const orgId = request.org!.orgId;
    const [vehiclesByStatus, listingsByStatus, activeSources, oldestQueued] = await Promise.all([
      app.prisma.vehicle.groupBy({ by: ["status"], where: { orgId }, _count: { id: true } }),
      app.prisma.listing.groupBy({ by: ["status"], where: { orgId }, _count: { id: true } }),
      app.prisma.importSource.count({ where: { orgId, status: "ACTIVE" } }),
      app.prisma.listing.findFirst({
        where: { orgId, status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    const listedLast7d = await app.prisma.listingEvent.count({
      where: { listing: { orgId }, toStatus: "LIVE", createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    });
    return {
      vehiclesByStatus: Object.fromEntries(vehiclesByStatus.map((r) => [r.status, r._count.id])),
      listingsByStatus: Object.fromEntries(listingsByStatus.map((r) => [r.status, r._count.id])),
      activeSources,
      listedLast7d,
      queueAgingHours: oldestQueued ? (Date.now() - oldestQueued.createdAt.getTime()) / 3_600_000 : 0,
    };
  });

  app.get("/analytics/salespeople", { preHandler: [app.requireOrg("analytics:read")] }, async (request) => {
    const { days } = analyticsQuerySchema.parse(request.query);
    const orgId = request.org!.orgId;
    const since = new Date(Date.now() - days * 86400_000);

    const members = await app.prisma.membership.findMany({
      where: { orgId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const eventRows = await app.prisma.$queryRaw<
      { actorUserId: string; day: Date; toStatus: string; count: bigint }[]
    >`
      SELECT e."actorUserId", date_trunc('day', e."createdAt")::date AS day, e."toStatus", count(*)::bigint AS count
      FROM "ListingEvent" e
      JOIN "Listing" l ON l."id" = e."listingId"
      WHERE l."orgId" = ${orgId}
        AND e."createdAt" >= ${since}
        AND e."actorUserId" IS NOT NULL
        AND e."toStatus" IN ('QUEUED','LIVE','REMOVED')
      GROUP BY e."actorUserId", day, e."toStatus"
      ORDER BY day ASC
    `;

    const assignedCounts = await app.prisma.listing.groupBy({
      by: ["assigneeId"],
      where: { orgId, status: { in: ["QUEUED", "ASSIGNED", "IN_PROGRESS"] }, assigneeId: { not: null } },
      _count: { id: true },
    });
    const assignedMap = new Map(assignedCounts.map((r) => [r.assigneeId!, r._count.id]));

    const byMember = new Map<string, { day: string; toStatus: string; count: number }[]>();
    for (const row of eventRows) {
      const day = row.day.toISOString().slice(0, 10);
      const list = byMember.get(row.actorUserId) ?? [];
      list.push({ day, toStatus: row.toStatus, count: Number(row.count) });
      byMember.set(row.actorUserId, list);
    }

    return {
      days,
      salespeople: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        queueDepth: assignedMap.get(m.userId) ?? 0,
        series: byMember.get(m.userId) ?? [],
      })),
    };
  });

  app.get("/analytics/sync-health", { preHandler: [app.requireOrg("analytics:read")] }, async (request) => {
    const orgId = request.org!.orgId;
    const sources = await app.prisma.importSource.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { vehicles: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 3 },
      },
    });
    return {
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status,
        scheduleMinutes: s.scheduleMinutes,
        lastRunAt: s.lastRunAt,
        lastStatus: s.lastStatus,
        lastError: s.lastError,
        vehicleCount: s._count.vehicles,
        recentRuns: s.runs,
        dueForSync:
          s.scheduleMinutes > 0
            ? (s.lastRunAt?.getTime() ?? 0) + s.scheduleMinutes * 60_000 <= Date.now()
            : false,
      })),
    };
  });

  app.get("/analytics/salespeople.csv", { preHandler: [app.requireOrg("analytics:read")] }, async (request, reply) => {
    const { days } = analyticsQuerySchema.parse(request.query);
    const orgId = request.org!.orgId;
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await app.prisma.$queryRaw<{ name: string; email: string; day: Date; toStatus: string; count: bigint }[]>`
      SELECT u."name", u."email", date_trunc('day', e."createdAt")::date AS day, e."toStatus", count(*)::bigint AS count
      FROM "ListingEvent" e
      JOIN "Listing" l ON l."id" = e."listingId"
      JOIN "User" u ON u."id" = e."actorUserId"
      WHERE l."orgId" = ${orgId} AND e."createdAt" >= ${since} AND e."toStatus" IN ('QUEUED','LIVE','REMOVED')
      GROUP BY u."name", u."email", day, e."toStatus"
      ORDER BY day ASC, u."name" ASC
    `;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      "name,email,day,event,count",
      ...rows.map((r) =>
        [escape(r.name), escape(r.email), r.day.toISOString().slice(0, 10), r.toStatus, String(Number(r.count))].join(","),
      ),
    ].join("\n");
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="salesperson-activity-${days}d.csv"`);
    return reply.send(csv);
  });
}
