import { prisma } from "@lotpilot/db";
import { handler, json, pageParams, requireUser } from "@/server/api";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pageParams(url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return json({ notifications, unread, page, pageSize, total });
});
