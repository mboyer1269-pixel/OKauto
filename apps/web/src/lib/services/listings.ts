/** Listing lifecycle: sold/reprice handling, takedown flagging, notifications. */
import { prisma, type ListingStatus } from '@okauto/db';

/**
 * Mark a vehicle sold and flag every active listing for takedown, notifying its lister.
 * Returns the number of listings flagged.
 */
export async function markVehicleSold(vehicleId: string, soldAt = new Date()): Promise<number> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return 0;

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { status: 'SOLD', soldAt },
  });

  const activeStatuses: ListingStatus[] = ['READY', 'PENDING', 'ACTIVE'];
  const listings = await prisma.listing.findMany({
    where: { vehicleId, status: { in: activeStatuses } },
  });

  for (const listing of listings) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'NEEDS_ATTENTION',
        events: {
          create: [
            { type: 'SOLD_DETECTED', message: 'Vehicle marked sold; listing needs takedown.' },
            { type: 'TAKEDOWN_REQUESTED', message: 'Please remove this listing from the marketplace.' },
          ],
        },
      },
    });
    await prisma.notification.create({
      data: {
        organizationId: listing.organizationId,
        userId: listing.listerId,
        type: 'SOLD_ALERT',
        title: `Sold: ${vehicle.title}`,
        body: 'This vehicle is sold. Take down its Marketplace listing to avoid dead leads.',
        metadata: { listingId: listing.id, vehicleId },
      },
    });
  }

  return listings.length;
}

/** Reprice a vehicle and notify listers of active listings about the change. */
export async function repriceVehicle(vehicleId: string, newPriceCents: number): Promise<number> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return 0;
  const previous = vehicle.priceCents;
  if (previous === newPriceCents) return 0;

  await prisma.vehicle.update({ where: { id: vehicleId }, data: { priceCents: newPriceCents } });

  const listings = await prisma.listing.findMany({
    where: { vehicleId, status: { in: ['READY', 'PENDING', 'ACTIVE'] } },
  });

  for (const listing of listings) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'NEEDS_ATTENTION',
        events: {
          create: [
            {
              type: 'PRICE_CHANGED',
              message: `Price changed from ${previous ?? 'n/a'} to ${newPriceCents} cents.`,
              metadata: { previous, next: newPriceCents },
            },
          ],
        },
      },
    });
    await prisma.notification.create({
      data: {
        organizationId: listing.organizationId,
        userId: listing.listerId,
        type: 'PRICE_CHANGE',
        title: `Price changed: ${vehicle.title}`,
        body: 'Update the Marketplace listing price to match inventory.',
        metadata: { listingId: listing.id, vehicleId, previous, next: newPriceCents },
      },
    });
  }

  return listings.length;
}
