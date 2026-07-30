import { prisma } from "@lotpilot/db";
import { handler, json, requireUser } from "@/server/api";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return json({ ok: true, marked: result.count });
});
