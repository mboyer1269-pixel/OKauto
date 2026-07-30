import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, badRequest, handler, hashToken, json, parseBody, requireUser } from "@/server/api";

const schema = z.object({ token: z.string().trim().min(16).max(128) });

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const { token } = await parseBody(req, schema);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!invitation || invitation.acceptedAt) throw badRequest("This invitation is invalid or was already used");
  if (invitation.expiresAt < new Date()) throw badRequest("This invitation has expired");
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw badRequest(`This invitation was issued to ${invitation.email}. Sign in with that email to accept it.`);
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
  });
  if (existing) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    return json({ organization: invitation.organization, role: existing.role, alreadyMember: true });
  }

  await prisma.$transaction([
    prisma.membership.create({
      data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
    }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
  ]);
  await audit(req, {
    organizationId: invitation.organizationId,
    userId: user.id,
    action: "invitation.accept",
    entityType: "invitation",
    entityId: invitation.id,
    data: { role: invitation.role },
  });
  return json({ organization: invitation.organization, role: invitation.role, alreadyMember: false });
});
