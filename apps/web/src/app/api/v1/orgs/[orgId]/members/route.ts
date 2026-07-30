import { prisma } from "@lotpilot/db";
import { handler, json, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId);
  const memberships = await prisma.membership.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return json({
    members: memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.createdAt,
      user: m.user,
    })),
  });
});
