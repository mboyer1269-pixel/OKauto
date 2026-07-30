import { prisma } from "@lotpilot/db";
import { log } from "../log.js";

const STALE_AFTER_DAYS = 30;
const REMINDER_EVERY_HOURS = 24;

/**
 * Nudges:
 *  1. Listings POSTED for > STALE_AFTER_DAYS get a "refresh your listing" note.
 *  2. Listings stuck in DELIST_REQUESTED get a daily reminder until resolved.
 */
export async function flagStaleListings(): Promise<{ notified: number }> {
  let notified = 0;
  const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 3600 * 1000);
  const reminderCutoff = new Date(Date.now() - REMINDER_EVERY_HOURS * 3600 * 1000);

  const stale = await prisma.listing.findMany({
    where: { status: "POSTED", postedAt: { lte: staleCutoff } },
    include: { vehicle: true },
  });
  for (const listing of stale) {
    const recent = await prisma.notification.findFirst({
      where: {
        userId: listing.userId,
        type: "LISTING_STALE",
        createdAt: { gte: reminderCutoff },
        data: { path: ["listingId"], equals: listing.id },
      },
    });
    if (recent) continue;
    await prisma.notification.create({
      data: {
        organizationId: listing.organizationId,
        userId: listing.userId,
        type: "LISTING_STALE",
        title: "Listing is over 30 days old",
        body: `Your Marketplace post for ${[listing.vehicle.year, listing.vehicle.make, listing.vehicle.model].filter(Boolean).join(" ")} has been up for ${STALE_AFTER_DAYS}+ days. Consider refreshing it for better reach.`,
        data: { listingId: listing.id, vehicleId: listing.vehicleId },
      },
    });
    notified++;
  }

  const pendingDelists = await prisma.listing.findMany({
    where: { status: "DELIST_REQUESTED", updatedAt: { lte: reminderCutoff } },
    include: { vehicle: true },
  });
  for (const listing of pendingDelists) {
    const recent = await prisma.notification.findFirst({
      where: {
        userId: listing.userId,
        type: "VEHICLE_SOLD",
        createdAt: { gte: reminderCutoff },
        data: { path: ["listingId"], equals: listing.id },
      },
    });
    if (recent) continue;
    await prisma.notification.create({
      data: {
        organizationId: listing.organizationId,
        userId: listing.userId,
        type: "VEHICLE_SOLD",
        title: "Reminder: delist your Marketplace post",
        body: `${[listing.vehicle.year, listing.vehicle.make, listing.vehicle.model].filter(Boolean).join(" ")} is still awaiting removal from Facebook Marketplace.`,
        data: { listingId: listing.id, vehicleId: listing.vehicleId },
      },
    });
    notified++;
  }

  if (notified > 0) log("info", "stale listing notifications sent", { notified });
  return { notified };
}
