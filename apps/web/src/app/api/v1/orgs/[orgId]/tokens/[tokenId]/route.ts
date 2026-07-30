import { prisma } from "@lotpilot/db";
import { audit, forbidden, handler, json, notFound, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; tokenId: string }> };

export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { orgId, tokenId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  const token = await prisma.apiToken.findFirst({ where: { id: tokenId, organizationId: orgId } });
  if (!token) throw notFound("Token not found");
  if (membership.role === "SALESPERSON" && token.userId !== user.id) {
    throw forbidden("You can only revoke your own tokens");
  }
  await prisma.apiToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "token.revoke",
    entityType: "api_token",
    entityId: tokenId,
  });
  return json({ ok: true });
});
