import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { auditLogs, users } from "../db/schema.js";
import { parseOrThrow } from "../lib/errors.js";
import { requireMembership } from "../plugins/auth.js";

const querySchema = z.object({
  action: z.string().max(120).optional(),
  entityType: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export function auditRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    app.get("/orgs/:orgId/audit-logs", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId, "MANAGER");
      const query = parseOrThrow(querySchema, request.query);
      const conditions: SQL[] = [eq(auditLogs.orgId, orgId)];
      if (query.action) conditions.push(eq(auditLogs.action, query.action));
      if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
      const where = and(...conditions);
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where);
      const items = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          meta: auditLogs.meta,
          ip: auditLogs.ip,
          createdAt: auditLogs.createdAt,
          actor: { id: users.id, name: users.name, email: users.email },
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return { items, page: query.page, pageSize: query.pageSize, total: Number(countRow?.count ?? 0) };
    });
  };
}
