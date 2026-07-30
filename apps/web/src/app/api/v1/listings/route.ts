import { prisma } from '@okauto/database';
import { createListingSchema } from '@okauto/shared';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';

export const GET = withAuth(async (request, { auth }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('userId');
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

  const where: Record<string, unknown> = { organizationId: auth.orgId };
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        vehicle: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
        user: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { listedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
  ]);

  return jsonResponse({ listings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

export const POST = withAuth(async (request, { auth }) => {
  const body = await parseBody<unknown>(request);
  const data = createListingSchema.parse(body);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: data.vehicleId, organizationId: auth.orgId },
  });
  if (!vehicle) return jsonResponse({ error: 'Vehicle not found' }, 404);

  const listing = await prisma.listing.create({
    data: {
      organizationId: auth.orgId,
      vehicleId: data.vehicleId,
      userId: auth.sub,
      platform: data.platform,
      externalUrl: data.externalUrl,
      externalId: data.externalId,
      priceAtListing: data.priceAtListing ?? vehicle.price,
      notes: data.notes,
      events: { create: { eventType: 'listing_created', metadata: { source: 'dashboard' } } },
    },
    include: {
      vehicle: { include: { photos: { take: 1 } } },
      user: { select: { id: true, name: true } },
    },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: 'LISTING',
    entityType: 'listing',
    entityId: listing.id,
    request: request as never,
  });

  return jsonResponse(listing, 201);
});
