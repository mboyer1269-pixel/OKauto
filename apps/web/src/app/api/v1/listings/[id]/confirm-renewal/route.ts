import { prisma } from "@okauto/database";
import { getListingHealth, hasMinRole } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const POST = withAuth(async (request, { auth, params }) => {
  const listing = await prisma.listing.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      ...(hasMinRole(auth.role, "MANAGER") ? {} : { userId: auth.sub }),
    },
    include: { vehicle: true },
  });
  if (!listing) return errorResponse("Annonce introuvable", 404);

  const health = getListingHealth({
    status: listing.status,
    vehiclePrice: listing.vehicle.price == null ? null : Number(listing.vehicle.price),
    marketplacePrice:
      listing.marketplacePrice == null ? null : Number(listing.marketplacePrice),
    priceAtListing:
      listing.priceAtListing == null ? null : Number(listing.priceAtListing),
    listedAt: listing.listedAt,
    lastRenewedAt: listing.lastRenewedAt,
  });
  if (!health.renewDue) {
    return errorResponse("Le renouvellement n'est pas encore dû.", 409);
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      lastRenewedAt: new Date(),
      renewalCount: { increment: 1 },
      events: { create: { eventType: "renewed" } },
    },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "listing",
    entityId: listing.id,
    metadata: { action: "confirm_renewal" },
    request: request as never,
  });

  return jsonResponse({
    ...updated,
    message: "Renouvellement enregistré. Prochain rappel dans 7 jours.",
  });
});
