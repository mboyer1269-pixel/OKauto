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
  assertCan(orgCtx, 'member:read');
  const members = await prisma.membership.findMany({
    where: { organizationId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return jsonOk(
    members.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  );
});
