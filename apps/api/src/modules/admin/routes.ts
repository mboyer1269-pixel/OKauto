import type { FastifyInstance } from "fastify";
import { AppError } from "@okauto/shared";
import { cursorWhere, toPaginated } from "../../lib/pagination.js";

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/orgs", { preHandler: [app.requirePlatformAdmin] }, async () => {
    const orgs = await app.prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { memberships: true, vehicles: true, listings: true } },
      },
    });
    return { orgs };
  });

  app.get("/admin/audit-logs", { preHandler: [app.requirePlatformAdmin] }, async (request) => {
    const query = request.query as { orgId?: string; action?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);
    const rows = await app.prisma.auditLog.findMany({
      where: {
        ...(query.orgId ? { orgId: query.orgId } : {}),
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
        ...cursorWhere(query.cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        actorUser: { select: { id: true, email: true, name: true } },
        org: { select: { id: true, name: true, slug: true } },
      },
    });
    return toPaginated(rows, limit);
  });

  app.get("/admin/jobs", { preHandler: [app.requirePlatformAdmin] }, async (request) => {
    const query = request.query as { status?: string; kind?: string };
    const jobs = await app.prisma.job.findMany({
      where: {
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const counts = await app.prisma.job.groupBy({ by: ["status"], _count: { id: true } });
    return { jobs, counts: Object.fromEntries(counts.map((c) => [c.status, c._count.id])) };
  });

  app.post("/admin/jobs/:id/requeue", { preHandler: [app.requirePlatformAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const job = await app.prisma.job.findUnique({ where: { id } });
    if (!job) throw AppError.notFound("Job not found");
    const updated = await app.jobQueue.requeue(id);
    return { job: updated };
  });

  app.get("/admin/stats", { preHandler: [app.requirePlatformAdmin] }, async () => {
    const [users, orgs, vehicles, listings, notifications, jobs] = await Promise.all([
      app.prisma.user.count(),
      app.prisma.organization.count(),
      app.prisma.vehicle.count(),
      app.prisma.listing.count(),
      app.prisma.notification.count(),
      app.prisma.job.count(),
    ]);
    return { users, orgs, vehicles, listings, notifications, jobs };
  });
}
