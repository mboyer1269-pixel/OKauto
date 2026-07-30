import { canManageRole, ORG_ROLES } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit, conflict, forbidden, handler, hashToken, json, parseBody, requireOrgRole } from "@/server/api";
import { env } from "@/server/env";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId, "MANAGER");
  const invitations = await prisma.invitation.findMany({
    where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });
  return json({ invitations });
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ORG_ROLES).default("SALESPERSON"),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId, "MANAGER");
  const body = await parseBody(req, createSchema);

  if (!canManageRole(membership.role, body.role)) {
    throw forbidden(`Your role cannot invite ${body.role.toLowerCase()}s`);
  }

  const existingMember = await prisma.user.findUnique({
    where: { email: body.email },
    include: { memberships: { where: { organizationId: orgId } } },
  });
  if (existingMember && existingMember.memberships.length > 0) {
    throw conflict("This person is already a member of the organization");
  }

  const token = randomBytes(24).toString("hex");
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: orgId,
      email: body.email,
      role: body.role,
      tokenHash: hashToken(token),
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // In-app notification for existing users; the accept URL is returned so the
  // dealer can share it directly (email dispatch is handled by the worker).
  if (existingMember) {
    await prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: existingMember.id,
        type: "INVITE",
        title: "You have been invited to a dealership",
        body: `You were invited to join as ${body.role.toLowerCase()}. Accept from the invite link.`,
        data: { invitationId: invitation.id },
      },
    });
  }

  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "invitation.create",
    entityType: "invitation",
    entityId: invitation.id,
    data: { email: body.email, role: body.role },
  });

  return json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        acceptUrl: `${env.appUrl}/invite/${token}`,
      },
    },
    { status: 201 },
  );
});
