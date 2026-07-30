import { prisma } from '@okauto/db';
import { handler, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'audit:read');
  const url = new URL(req.url);
  const take = Math.min(Number.parseInt(url.searchParams.get('take') ?? '50', 10) || 50, 200);
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: id },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return jsonOk(logs);
});
