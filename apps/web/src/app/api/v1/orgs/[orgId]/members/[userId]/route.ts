import { canManageRole, ORG_ROLES } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { z } from "zod";
import {
  audit,
  badRequest,
  forbidden,
  handler,
  json,
  notFound,
  parseBody,
  requireOrgRole,
} from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

const patchSchema = z.object({ role: z.enum(ORG_ROLES) });

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { orgId, userId } = await ctx.params;
  const { user: actor, membership: actorMembership } = await requireOrgRole(req, orgId, "MANAGER");
  const body = await parseBody(req, patchSchema);

  const target = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!target) throw notFound("Member not found");
  if (
    !canManageRole(actorMembership.role, target.role) ||
    !canManageRole(actorMembership.role, body.role)
  ) {
    throw forbidden("You cannot manage members at this role level");
  }
  if (target.role === "OWNER" && body.role !== "OWNER") {
    const owners = await prisma.membership.count({
      where: { organizationId: orgId, role: "OWNER" },
    });
    if (owners <= 1) throw badRequest("An organization must keep at least one owner");
  }

  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: { role: body.role },
  });
  await audit(req, {
    organizationId: orgId,
    userId: actor.id,
    action: "member.role_change",
    entityType: "membership",
    entityId: target.id,
    data: { targetUserId: userId, from: target.role, to: body.role },
  });
  return json({ member: { userId, role: updated.role } });
});

export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { orgId, userId } = await ctx.params;
  const { user: actor, membership: actorMembership } = await requireOrgRole(req, orgId, "MANAGER");

  const target = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!target) throw notFound("Member not found");
  if (userId !== actor.id && !canManageRole(actorMembership.role, target.role)) {
    throw forbidden("You cannot remove members at this role level");
  }
  if (target.role === "OWNER") {
    const owners = await prisma.membership.count({
      where: { organizationId: orgId, role: "OWNER" },
    });
    if (owners <= 1) throw badRequest("An organization must keep at least one owner");
  }

  await prisma.membership.delete({ where: { id: target.id } });
  await audit(req, {
    organizationId: orgId,
    userId: actor.id,
    action: "member.remove",
    entityType: "membership",
    entityId: target.id,
    data: { targetUserId: userId },
  });
  return json({ ok: true });
});
