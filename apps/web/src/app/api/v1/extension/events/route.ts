import { NextRequest } from 'next/server';
import { prisma } from '@okauto/database';
import { extensionEventSchema } from '@okauto/shared';
import { authenticateApiKey } from '@/lib/auth';
import { jsonResponse, errorResponse, handleApiError, parseBody } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) return errorResponse('API key required', 401);

    const auth = await authenticateApiKey(apiKey);
    if (!auth) return errorResponse('Invalid API key', 401);

    const body = await parseBody<unknown>(request);
    const data = extensionEventSchema.parse(body);

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
    });
    if (!vehicle) return errorResponse('Vehicle not found', 404);

    if (data.eventType === 'listing_created') {
      const listing = await prisma.listing.create({
        data: {
          organizationId: auth.orgId,
          vehicleId: data.vehicleId,
          userId: auth.user.id,
          externalUrl: (data.metadata?.externalUrl as string) ?? undefined,
          priceAtListing: vehicle.price,
          events: {
            create: { eventType: data.eventType, metadata: data.metadata as never },
          },
        },
      });
      return jsonResponse({ listingId: listing.id, success: true });
    }

    if (data.eventType === 'listing_removed' && data.listingId) {
      await prisma.listing.update({
        where: { id: data.listingId },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      await prisma.listingEvent.create({
        data: { listingId: data.listingId, eventType: data.eventType, metadata: data.metadata as never },
      });
      return jsonResponse({ success: true });
    }

    if (data.listingId) {
      await prisma.listingEvent.create({
        data: { listingId: data.listingId, eventType: data.eventType, metadata: data.metadata as never },
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
