import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { notifications } from "../db/schema.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { requireUser } from "../plugins/auth.js";

const querySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function notificationRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    app.get("/notifications", async (request) => {
      const user = requireUser(request);
      const query = parseOrThrow(querySchema, request.query);
      const conditions: SQL[] = [eq(notifications.userId, user.sub)];
      if (query.unreadOnly) conditions.push(isNull(notifications.readAt));
      const where = and(...conditions);
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(where);
      const items = await db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return { items, page: query.page, pageSize: query.pageSize, total: Number(countRow?.count ?? 0) };
    });

    app.get("/notifications/unread-count", async (request) => {
      const user = requireUser(request);
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, user.sub), isNull(notifications.readAt)));
      return { count: Number(row?.count ?? 0) };
    });

    app.post("/notifications/:notificationId/read", async (request) => {
      const user = requireUser(request);
      const { notificationId } = request.params as { notificationId: string };
      const [updated] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.sub)))
        .returning();
      if (!updated) throw errors.notFound("Notification not found");
      return { notification: updated };
    });

    app.post("/notifications/read-all", async (request) => {
      const user = requireUser(request);
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, user.sub), isNull(notifications.readAt)));
      return { ok: true };
    });
  };
}
