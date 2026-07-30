import { prisma } from "@lotpilot/db";
import { audit, handler, json, notFound, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; invitationId: string }> };

export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { orgId, invitationId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
  });
  if (!invitation) throw notFound("Invitation not found");
  await prisma.invitation.delete({ where: { id: invitationId } });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "invitation.revoke",
    entityType: "invitation",
    entityId: invitationId,
    data: { email: invitation.email },
  });
  return json({ ok: true });
});
