import { prisma } from "@lotpilot/db";
import { handler, json, notFound, requireUser } from "@/server/api";

type Ctx = { params: Promise<{ notificationId: string }> };

export const POST = handler<Ctx>(async (req, ctx) => {
  const { notificationId } = await ctx.params;
  const user = await requireUser(req);
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId: user.id },
  });
  if (!notification) throw notFound("Notification not found");
  await prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  return json({ ok: true });
});
