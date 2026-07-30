import { prisma } from "@lotpilot/db";
import { handler, json, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [
    inventoryByStatus,
    listingsByStatus,
    postedLast30,
    soldLast30,
    priceChangesLast30,
    activeSources,
    erroredSources,
    pendingDelists,
  ] = await Promise.all([
    prisma.vehicle.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
    prisma.listing.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
    prisma.listing.count({
      where: { organizationId: orgId, status: { in: ["POSTED", "DELIST_REQUESTED", "DELISTED"] }, postedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.vehicle.count({ where: { organizationId: orgId, status: "SOLD", soldAt: { gte: thirtyDaysAgo } } }),
    prisma.priceChange.count({
      where: { vehicle: { organizationId: orgId }, detectedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.inventorySource.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.inventorySource.count({ where: { organizationId: orgId, status: "ERROR" } }),
    prisma.listing.count({ where: { organizationId: orgId, status: "DELIST_REQUESTED" } }),
  ]);

  const toMap = (rows: Array<{ status: string; _count: number }>) =>
    Object.fromEntries(rows.map((r) => [r.status, r._count]));

  return json({
    inventory: toMap(inventoryByStatus),
    listings: toMap(listingsByStatus),
    last30Days: { posted: postedLast30, sold: soldLast30, priceChanges: priceChangesLast30 },
    syncHealth: { activeSources, erroredSources },
    actionNeeded: { pendingDelists },
  });
});
