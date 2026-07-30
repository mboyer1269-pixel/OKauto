import { prisma } from '@okauto/database';
import { updateListingSchema } from '@okauto/shared';
import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';

export const PATCH = withAuth(async (request, { auth, params }) => {
  const body = await parseBody<unknown>(request);
  const data = updateListingSchema.parse(body);

  const existing = await prisma.listing.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!existing) return errorResponse('Listing not found', 404);

  const listing = await prisma.listing.update({
    where: { id: params!.id },
    data: {
      status: data.status,
      externalUrl: data.externalUrl,
      removedAt: data.status === 'REMOVED' ? new Date() : data.removedAt ? new Date(data.removedAt) : undefined,
    },
    include: { vehicle: true, user: { select: { id: true, name: true } } },
  });

  return jsonResponse(listing);
});
