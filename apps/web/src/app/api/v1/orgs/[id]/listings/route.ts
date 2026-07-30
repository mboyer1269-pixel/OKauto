import { prisma, type Prisma } from '@okauto/db';
import { createListingSchema } from '@okauto/shared';
import { can } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);

  const url = new URL(req.url);
  const status = url.searchParams.get('status')?.trim();
  const take = Math.min(Number.parseInt(url.searchParams.get('take') ?? '50', 10) || 50, 200);

  const where: Prisma.ListingWhereInput = { organizationId: id };
  if (status) where.status = status as Prisma.ListingWhereInput['status'];
  // Salespeople only see their own listings.
  if (!can(orgCtx.role, 'listing:read:any')) {
    where.listerId = user.id;
  }

  const listings = await prisma.listing.findMany({
    where,
    include: {
      vehicle: { select: { id: true, title: true, priceCents: true, status: true } },
      lister: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });
  return jsonOk(listings);
});

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'listing:create');

  const input = await parseJson(req, createListingSchema);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, organizationId: id },
  });
  if (!vehicle) throw httpErrors.notFound('Vehicle not found in this organization');

  const listing = await prisma.listing.create({
    data: {
      organizationId: id,
      vehicleId: vehicle.id,
      listerId: user.id,
      channel: input.channel,
      status: 'READY',
      description: input.description ?? '',
      priceCentsAtListing: vehicle.priceCents,
      events: { create: [{ type: 'CREATED', message: 'Listing created' }] },
    },
    include: { vehicle: { select: { id: true, title: true } } },
  });

  await audit({
    organizationId: id,
    actorId: user.id,
    action: 'listing.create',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
  });
  return jsonOk(listing, { status: 201 });
});
