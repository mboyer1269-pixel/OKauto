import { prisma } from '@okauto/db';
import { updateMemberSchema } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const membership = await prisma.membership.findUnique({ where: { id } });
  if (!membership) throw httpErrors.notFound('Membership not found');
  const orgCtx = await requireOrgContext(user, membership.organizationId);
  assertCan(orgCtx, 'member:update');
  const input = await parseJson(req, updateMemberSchema);

  // Prevent removing the last OWNER.
  if (membership.role === 'OWNER' && input.role !== 'OWNER') {
    const owners = await prisma.membership.count({
      where: { organizationId: membership.organizationId, role: 'OWNER' },
    });
    if (owners <= 1) throw httpErrors.conflict('An organization must keep at least one OWNER');
  }

  const updated = await prisma.membership.update({ where: { id }, data: { role: input.role } });
  await audit({
    organizationId: membership.organizationId,
    actorId: user.id,
    action: 'member.update',
    targetType: 'membership',
    targetId: id,
    metadata: { role: input.role },
    ip: clientIp(req),
  });
  return jsonOk({ membershipId: updated.id, role: updated.role });
});

export const DELETE = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const membership = await prisma.membership.findUnique({ where: { id } });
  if (!membership) throw httpErrors.notFound('Membership not found');
  const orgCtx = await requireOrgContext(user, membership.organizationId);
  assertCan(orgCtx, 'member:remove');

  if (membership.role === 'OWNER') {
    const owners = await prisma.membership.count({
      where: { organizationId: membership.organizationId, role: 'OWNER' },
    });
    if (owners <= 1) throw httpErrors.conflict('An organization must keep at least one OWNER');
  }

  await prisma.membership.delete({ where: { id } });
  await audit({
    organizationId: membership.organizationId,
    actorId: user.id,
    action: 'member.remove',
    targetType: 'membership',
    targetId: id,
    ip: clientIp(req),
  });
  return jsonOk({ ok: true });
});
