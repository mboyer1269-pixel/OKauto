import { prisma } from '@okauto/db';
import { handler, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Vehicles available to list (AVAILABLE status), for the extension picker. */
export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'vehicle:read');

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();

  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: id,
      status: 'AVAILABLE',
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { vin: { contains: q, mode: 'insensitive' } },
              { stockNumber: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, title: true, priceCents: true, mileage: true, vin: true, stockNumber: true,
      _count: { select: { photos: true, listings: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return jsonOk(vehicles);
});
