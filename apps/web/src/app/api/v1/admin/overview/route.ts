import { prisma } from "@lotpilot/db";
import { handler, json, requirePlatformAdmin } from "@/server/api";

export const GET = handler(async (req) => {
  await requirePlatformAdmin(req);
  const [orgs, users, vehicles, listings, recentOrgs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.listing.count(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { memberships: true, vehicles: true, listings: true } } },
    }),
  ]);
  return json({ totals: { orgs, users, vehicles, listings }, recentOrgs });
});
