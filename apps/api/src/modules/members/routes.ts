import type { FastifyInstance } from "fastify";
import {
  AppError,
  INVITE_TTL_SECONDS,
  assignableRoles,
  createInviteSchema,
  updateMemberSchema,
} from "@okauto/shared";
import { randomToken, sha256 } from "../../lib/tokens.js";
import { writeAudit } from "../../lib/audit.js";

export default async function memberRoutes(app: FastifyInstance) {
  app.get("/members", { preHandler: [app.requireOrg("member:read")] }, async (request) => {
    const members = await app.prisma.membership.findMany({
      where: { orgId: request.org!.orgId },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
    const invites = await app.prisma.invite.findMany({
      where: { orgId: request.org!.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { members, invites };
  });

  app.patch("/members/:id", { preHandler: [app.requireOrg("member:update-role")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = updateMemberSchema.parse(request.body);
    const actorRole = request.org!.role;
    const orgId = request.org!.orgId;

    const target = await app.prisma.membership.findFirst({
      where: { id, orgId },
      include: { user: true },
    });
    if (!target) throw AppError.notFound("Member not found");

    if (input.role && !assignableRoles(actorRole).includes(input.role)) {
      throw AppError.forbidden("You cannot assign this role");
    }
    if (target.userId === request.auth!.userId && (input.status === "DEACTIVATED" || (input.role && input.role !== target.role))) {
      throw AppError.validation("You cannot change your own membership");
    }
    if (target.role === "ORG_OWNER" && (input.status === "DEACTIVATED" || (input.role && input.role !== "ORG_OWNER"))) {
      const owners = await app.prisma.membership.count({
        where: { orgId, role: "ORG_OWNER", status: "ACTIVE" },
      });
      if (owners <= 1) throw AppError.validation("Organization must keep at least one active owner");
    }

    const membership = await app.prisma.membership.update({
      where: { id: target.id },
      data: { role: input.role, status: input.status },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "MEMBER_UPDATED",
      entityType: "Membership",
      entityId: membership.id,
      meta: { before: { role: target.role, status: target.status }, after: { role: membership.role, status: membership.status } },
      ip: request.ip,
    });
    return { membership };
  });

  app.post("/invites", { preHandler: [app.requireOrg("member:invite")] }, async (request, reply) => {
    const input = createInviteSchema.parse(request.body);
    const orgId = request.org!.orgId;

    const existingMember = await app.prisma.membership.findFirst({
      where: { orgId, status: "ACTIVE", user: { email: input.email } },
    });
    if (existingMember) throw AppError.conflict("This person is already a member");

    await app.prisma.invite.deleteMany({ where: { orgId, email: input.email, acceptedAt: null } });
    const plaintext = randomToken(32);
    const invite = await app.prisma.invite.create({
      data: {
        orgId,
        email: input.email,
        role: input.role,
        tokenHash: sha256(plaintext),
        expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000),
        createdById: request.auth!.userId,
      },
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "INVITE_CREATED",
      entityType: "Invite",
      entityId: invite.id,
      meta: { email: input.email, role: input.role },
      ip: request.ip,
    });
    // The invite link is returned to the inviter (MVP: copy/paste; email transport is P1).
    return reply.status(201).send({
      invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
      inviteUrl: `${app.config.API_PUBLIC_URL}/invite/${plaintext}`,
      token: plaintext,
    });
  });

  app.delete("/invites/:id", { preHandler: [app.requireOrg("member:invite")] }, async (request) => {
    const { id } = request.params as { id: string };
    const invite = await app.prisma.invite.findFirst({
      where: { id, orgId: request.org!.orgId, acceptedAt: null },
    });
    if (!invite) throw AppError.notFound("Invite not found");
    await app.prisma.invite.delete({ where: { id: invite.id } });
    return { ok: true };
  });
}
