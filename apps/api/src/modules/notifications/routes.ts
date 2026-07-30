import type { FastifyInstance } from "fastify";
import { AppError, SSE_HEARTBEAT_MS, notificationQuerySchema } from "@okauto/shared";
import { cursorWhere, toPaginated } from "../../lib/pagination.js";
import { notificationHub } from "./hub.js";

export default async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: [app.requireOrg("notification:read")] }, async (request) => {
    const query = notificationQuerySchema.parse(request.query);
    const rows = await app.prisma.notification.findMany({
      where: {
        orgId: request.org!.orgId,
        userId: request.auth!.userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...cursorWhere(query.cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const unreadCount = await app.prisma.notification.count({
      where: { orgId: request.org!.orgId, userId: request.auth!.userId, readAt: null },
    });
    return { ...toPaginated(rows, query.limit), unreadCount };
  });

  app.post("/notifications/:id/read", { preHandler: [app.requireOrg("notification:read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await app.prisma.notification.updateMany({
      where: { id, orgId: request.org!.orgId, userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw AppError.notFound("Notification not found");
    return { ok: true };
  });

  app.post("/notifications/read-all", { preHandler: [app.requireOrg("notification:read")] }, async (request) => {
    const result = await app.prisma.notification.updateMany({
      where: { orgId: request.org!.orgId, userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  });

  app.get("/notifications/stream", { preHandler: [app.requireOrg("notification:read")] }, async (request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const unreadCount = await app.prisma.notification.count({
      where: { orgId: request.org!.orgId, userId: request.auth!.userId, readAt: null },
    });
    send("hello", { unreadCount, serverTime: new Date().toISOString() });

    const remove = notificationHub.add({
      orgId: request.org!.orgId,
      userId: request.auth!.userId,
      send,
    });
    const heartbeat = setInterval(() => send("ping", { t: Date.now() }), SSE_HEARTBEAT_MS);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      remove();
    });
    // Keep the handler pending; fastify completes when the socket closes.
    await new Promise<void>((resolve) => {
      request.raw.on("close", resolve);
    });
    return reply;
  });
}
