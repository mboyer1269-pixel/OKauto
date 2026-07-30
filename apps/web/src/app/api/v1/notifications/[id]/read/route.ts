import { prisma } from '@okauto/db';
import { handler, httpErrors, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== user.id) throw httpErrors.notFound('Notification not found');
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return jsonOk({ ok: true });
});
