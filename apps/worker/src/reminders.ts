import { prisma } from "@okauto/database";

export async function processRemovalReminders(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const listings = await prisma.listing.findMany({
    where: {
      status: "STALE",
      staleSince: { lt: cutoff },
      removalReminderSentAt: null,
    },
    include: {
      vehicle: {
        select: { year: true, make: true, model: true, stockNumber: true },
      },
      user: { select: { id: true, name: true } },
    },
  });

  const byOrg = new Map<string, typeof listings>();
  for (const listing of listings) {
    const group = byOrg.get(listing.organizationId) ?? [];
    group.push(listing);
    byOrg.set(listing.organizationId, group);
  }

  for (const [organizationId, orgListings] of byOrg) {
    for (const listing of orgListings) {
      const hours = Math.max(
        24,
        Math.floor(
          (now.getTime() - (listing.staleSince ?? listing.updatedAt).getTime()) /
            3_600_000,
        ),
      );
      const title = [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model]
        .filter(Boolean)
        .join(" ");
      await prisma.notification.create({
        data: {
          userId: listing.userId,
          type: "LISTING_REMINDER",
          title: "Rappel : annonce d’un véhicule vendu encore en ligne",
          message: `${title || "Véhicule"} est vendu depuis ${hours} h. Chaque jour en ligne génère des messages inutiles.`,
          metadata: { listingId: listing.id, vehicleId: listing.vehicleId },
        },
      });
      await prisma.listing.update({
        where: { id: listing.id },
        data: { removalReminderSentAt: now },
      });
    }

    const managers = await prisma.organizationMember.findMany({
      where: { organizationId, role: { in: ["OWNER", "ADMIN", "MANAGER"] } },
      select: { userId: true },
    });
    const oldest = [...orgListings]
      .sort(
        (a, b) =>
          (a.staleSince ?? a.updatedAt).getTime() -
          (b.staleSince ?? b.updatedAt).getTime(),
      )
      .slice(0, 3)
      .map((listing) => {
        const hours = Math.floor(
          (now.getTime() - (listing.staleSince ?? listing.updatedAt).getTime()) /
            3_600_000,
        );
        const title = [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model]
          .filter(Boolean)
          .join(" ");
        return `${listing.user.name} (${title}, ${hours} h)`;
      });
    for (const manager of managers) {
      await prisma.notification.create({
        data: {
          userId: manager.userId,
          type: "LISTING_REMINDER",
          title: `${orgListings.length} annonce(s) de véhicules vendus encore en ligne`,
          message: `Les plus anciennes : ${oldest.join(" ; ")}`,
          metadata: { organizationId, count: orgListings.length },
        },
      });
    }
  }

  return listings.length;
}
