import { prisma } from '@okauto/db';
import { acceptInviteSchema } from '@okauto/shared';
import { hashPassword, hashToken } from '@okauto/shared/password';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { createSessionToken, getCurrentUser, setSessionCookie } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Accept an invite. If the caller is signed in, the invite is attached to their account.
 * Otherwise a new account is created from the invite email (name + password required).
 */
export const POST = handler(async (req) => {
  const input = await parseJson(req, acceptInviteSchema);
  const tokenHash = await hashToken(input.token);
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (!invite || invite.status !== 'PENDING') throw httpErrors.badRequest('Invalid or used invite');
  if (invite.expiresAt < new Date()) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
    throw httpErrors.badRequest('Invite has expired');
  }

  const session = await getCurrentUser();
  let userId: string;

  if (session) {
    userId = session.sub;
  } else {
    let user = await prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      if (!input.password || !input.name) {
        throw httpErrors.badRequest('Name and password are required to create an account');
      }
      user = await prisma.user.create({
        data: {
          email: invite.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
    }
    userId = user.id;
    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    });
    await setSessionCookie(token);
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
      update: { role: invite.role },
      create: { userId, organizationId: invite.organizationId, role: invite.role },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    }),
  ]);

  await audit({
    organizationId: invite.organizationId,
    actorId: userId,
    action: 'member.invite.accept',
    targetType: 'invite',
    targetId: invite.id,
    ip: clientIp(req),
  });

  return jsonOk({ organizationId: invite.organizationId, role: invite.role });
});
