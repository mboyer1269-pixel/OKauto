import { prisma } from '@okauto/database';
import { updateListingSchema } from '@okauto/shared';
import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';

export const PATCH = withAuth(async (request, { auth, params }) => {
  const body = await parseBody<unknown>(request);
  const data = updateListingSchema.parse(body);

  const existing = await prisma.listing.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      userId: auth.sub,
    },
  });
  if (!existing) return errorResponse('Listing not found', 404);

  const listing = await prisma.listing.update({
    where: { id: params!.id },
    data: {
      status: data.status,
      externalUrl: data.externalUrl,
      removedAt: data.status === 'REMOVED' ? new Date() : data.removedAt ? new Date(data.removedAt) : undefined,
      events: {
        create: {
          eventType: data.status ? `status_${data.status.toLowerCase()}` : 'listing_updated',
          metadata: {
            previousStatus: existing.status,
            externalUrlChanged: data.externalUrl !== undefined && data.externalUrl !== existing.externalUrl,
            source: 'dashboard',
          },
        },
      },
    },
    include: { vehicle: true, user: { select: { id: true, name: true } } },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: 'UPDATE',
    entityType: 'listing',
    entityId: listing.id,
    request: request as never,
  });

  return jsonResponse(listing);
});
