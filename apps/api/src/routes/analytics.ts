import type { FastifyInstance } from "fastify";
import { prisma } from "@okauto/db";
import { authenticate, requireOrgPermission } from "../plugins/auth.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId/analytics/summary",
    { preHandler: [authenticate, requireOrgPermission("analytics:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };

      const [
        vehicleCounts,
        listingCounts,
        bySalesperson,
        recentActivity,
        syncHealth,
      ] = await Promise.all([
        prisma.vehicle.groupBy({
          by: ["status"],
          where: { organizationId: orgId },
          _count: true,
        }),
        prisma.listing.groupBy({
          by: ["status"],
          where: { organizationId: orgId },
          _count: true,
        }),
        prisma.listing.groupBy({
          by: ["userId"],
          where: { organizationId: orgId },
          _count: true,
        }),
        prisma.listingEvent.findMany({
          where: { listing: { organizationId: orgId } },
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        }),
        prisma.inventorySource.findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            name: true,
            type: true,
            health: true,
            lastSyncAt: true,
            lastSuccessAt: true,
            lastError: true,
            consecutiveFails: true,
          },
        }),
      ]);

      const userIds = bySalesperson.map((r) => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        vehiclesByStatus: Object.fromEntries(
          vehicleCounts.map((v) => [v.status, v._count]),
        ),
        listingsByStatus: Object.fromEntries(
          listingCounts.map((v) => [v.status, v._count]),
        ),
        listingsBySalesperson: bySalesperson.map((row) => ({
          userId: row.userId,
          count: row._count,
          user: userMap.get(row.userId) ?? null,
        })),
        recentActivity,
        syncHealth,
      };
    },
  );
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId/notifications",
    { preHandler: [authenticate, requireOrgPermission("notifications:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const items = await prisma.notification.findMany({
        where: { organizationId: orgId, userId: request.user!.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { items };
    },
  );

  app.post(
    "/v1/orgs/:orgId/notifications/:id/read",
    { preHandler: [authenticate, requireOrgPermission("notifications:read")] },
    async (request, reply) => {
      const { orgId, id } = request.params as { orgId: string; id: string };
      const n = await prisma.notification.findFirst({
        where: { id, organizationId: orgId, userId: request.user!.id },
      });
      if (!n) return reply.code(404).send({ error: "Not found" });
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      return { notification: updated };
    },
  );

  app.post(
    "/v1/orgs/:orgId/notifications/read-all",
    { preHandler: [authenticate, requireOrgPermission("notifications:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const result = await prisma.notification.updateMany({
        where: {
          organizationId: orgId,
          userId: request.user!.id,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      return { updated: result.count };
    },
  );
}

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId/audit",
    { preHandler: [authenticate, requireOrgPermission("audit:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const q = request.query as { take?: string; skip?: string };
      const take = Math.min(Number(q.take ?? 50), 200);
      const skip = Number(q.skip ?? 0);
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.auditLog.count({ where: { organizationId: orgId } }),
      ]);
      return { items, total, take, skip };
    },
  );
}
