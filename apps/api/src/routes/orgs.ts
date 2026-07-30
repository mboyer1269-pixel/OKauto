import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@okauto/db";
import { InviteSchema } from "@okauto/shared";
import { authenticate, requireOrgPermission } from "../plugins/auth.js";
import { writeAudit } from "../services/audit.js";

export async function orgRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId",
    { preHandler: [authenticate, requireOrgPermission("org:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
      return { organization: org, role: request.org!.role };
    },
  );

  app.patch(
    "/v1/orgs/:orgId",
    { preHandler: [authenticate, requireOrgPermission("settings:write")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const body = (request.body ?? {}) as {
        name?: string;
        settings?: Record<string, unknown>;
      };
      const org = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.settings
            ? { settings: body.settings as Prisma.InputJsonValue }
            : {}),
        },
      });
      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "org.update",
        entity: "organization",
        entityId: orgId,
        meta: body as Record<string, unknown>,
      });
      return { organization: org };
    },
  );

  app.get(
    "/v1/orgs/:orgId/members",
    { preHandler: [authenticate, requireOrgPermission("members:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const members = await prisma.membership.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "asc" },
      });
      return { members };
    },
  );

  app.post(
    "/v1/orgs/:orgId/invites",
    { preHandler: [authenticate, requireOrgPermission("members:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = InviteSchema.parse(request.body);
      const token = crypto.randomBytes(24).toString("hex");
      const invite = await prisma.invite.create({
        data: {
          organizationId: orgId,
          email: body.email.toLowerCase(),
          role: body.role,
          token,
          invitedById: request.user!.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "invite.created",
        entity: "invite",
        entityId: invite.id,
        meta: { email: invite.email, role: invite.role },
      });
      return reply.code(201).send({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          acceptPath: `/accept-invite?token=${token}`,
          // Returned once for demo/dev onboarding; production would email this.
          token,
        },
      });
    },
  );

  app.get(
    "/v1/orgs/:orgId/invites",
    { preHandler: [authenticate, requireOrgPermission("members:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const invites = await prisma.invite.findMany({
        where: { organizationId: orgId, acceptedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      return { invites };
    },
  );

  app.patch(
    "/v1/orgs/:orgId/members/:membershipId",
    { preHandler: [authenticate, requireOrgPermission("members:write")] },
    async (request, reply) => {
      const { orgId, membershipId } = request.params as {
        orgId: string;
        membershipId: string;
      };
      const body = (request.body ?? {}) as {
        role?: "manager" | "salesperson" | "viewer";
        status?: "active" | "deactivated";
      };
      const membership = await prisma.membership.findFirst({
        where: { id: membershipId, organizationId: orgId },
      });
      if (!membership) {
        return reply.code(404).send({ error: "Membership not found" });
      }
      if (membership.role === "owner") {
        return reply.code(400).send({ error: "Cannot modify owner membership" });
      }
      const updated = await prisma.membership.update({
        where: { id: membershipId },
        data: {
          role: body.role,
          status: body.status,
        },
      });
      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "member.update",
        entity: "membership",
        entityId: membershipId,
        meta: body,
      });
      return { membership: updated };
    },
  );
}
