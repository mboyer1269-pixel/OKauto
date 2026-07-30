import { prisma } from '@okauto/db';
import { handler, httpErrors, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const token = await prisma.apiToken.findUnique({ where: { id } });
  if (!token || token.userId !== user.id) throw httpErrors.notFound('Token not found');
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ actorId: user.id, action: 'token.revoke', targetType: 'apiToken', targetId: id, ip: clientIp(req) });
  return jsonOk({ ok: true });
});
