import { prisma } from '@okauto/db';
import { inviteSchema } from '@okauto/shared';
import { generateToken, hashToken } from '@okauto/shared/password';
import { handler, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'member:read');
  const invites = await prisma.invite.findMany({
    where: { organizationId: id, status: 'PENDING' },
    select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return jsonOk(invites);
});

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'member:invite');
  const input = await parseJson(req, inviteSchema);

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const invite = await prisma.invite.create({
    data: {
      organizationId: id,
      email: input.email,
      role: input.role,
      tokenHash,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  await audit({
    organizationId: id,
    actorId: user.id,
    action: 'member.invite',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email: input.email, role: input.role },
    ip: clientIp(req),
  });

  // The raw token is only returned once; deliver via email in production.
  const acceptUrl = `${env.appUrl}/invite/accept?token=${token}`;
  return jsonOk(
    { id: invite.id, email: invite.email, role: invite.role, token, acceptUrl },
    { status: 201 },
  );
});
