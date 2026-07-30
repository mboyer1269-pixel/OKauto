import { prisma } from "@lotpilot/db";
import { handler, json, requireUser } from "@/server/api";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      platformRole: user.platformRole,
    },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      role: m.role,
      organization: m.organization,
    })),
  });
});
