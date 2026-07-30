/** Dealer + salesperson analytics aggregations. */
import { prisma } from '@okauto/db';

export interface OrgAnalytics {
  inventory: { total: number; available: number; sold: number; pendingSale: number };
  listings: { total: number; active: number; needsAttention: number; sold: number; draft: number };
  perSalesperson: Array<{
    userId: string;
    name: string;
    active: number;
    needsAttention: number;
    total: number;
    sold: number;
  }>;
  medianTimeToListMinutes: number | null;
}

export async function getOrgAnalytics(organizationId: string): Promise<OrgAnalytics> {
  const [vehicles, listings, members] = await Promise.all([
    prisma.vehicle.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    prisma.listing.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    prisma.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const vCount = (s: string) => vehicles.find((v) => v.status === s)?._count ?? 0;
  const lCount = (s: string) => listings.find((l) => l.status === s)?._count ?? 0;

  const listingsByUser = await prisma.listing.groupBy({
    by: ['listerId', 'status'],
    where: { organizationId },
    _count: true,
  });

  const perSalesperson = members
    .map((m) => {
      const rows = listingsByUser.filter((r) => r.listerId === m.user.id);
      const byStatus = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
      const total = rows.reduce((sum, r) => sum + r._count, 0);
      return {
        userId: m.user.id,
        name: m.user.name,
        active: byStatus('ACTIVE'),
        needsAttention: byStatus('NEEDS_ATTENTION'),
        sold: byStatus('SOLD'),
        total,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.active - a.active);

  // Median time-to-list: vehicle.createdAt → first listing activatedAt.
  const activated = await prisma.listing.findMany({
    where: { organizationId, activatedAt: { not: null } },
    select: { activatedAt: true, vehicle: { select: { createdAt: true } } },
    take: 500,
    orderBy: { activatedAt: 'desc' },
  });
  const deltas = activated
    .map((l) =>
      l.activatedAt && l.vehicle
        ? (l.activatedAt.getTime() - l.vehicle.createdAt.getTime()) / 60000
        : null,
    )
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);
  const medianTimeToListMinutes =
    deltas.length > 0 ? Math.round(deltas[Math.floor(deltas.length / 2)]!) : null;

  return {
    inventory: {
      total: vehicles.reduce((s, v) => s + v._count, 0),
      available: vCount('AVAILABLE'),
      sold: vCount('SOLD'),
      pendingSale: vCount('PENDING_SALE'),
    },
    listings: {
      total: listings.reduce((s, l) => s + l._count, 0),
      active: lCount('ACTIVE'),
      needsAttention: lCount('NEEDS_ATTENTION'),
      sold: lCount('SOLD'),
      draft: lCount('DRAFT'),
    },
    perSalesperson,
    medianTimeToListMinutes,
  };
}
