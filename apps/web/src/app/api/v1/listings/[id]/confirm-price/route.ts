import { prisma } from "@okauto/database";
import { confirmListingPriceSchema, hasMinRole } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const POST = withAuth(async (request, { auth, params }) => {
  const data = confirmListingPriceSchema.parse(await parseBody(request));
  const listing = await prisma.listing.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      ...(hasMinRole(auth.role, "MANAGER") ? {} : { userId: auth.sub }),
    },
    include: { vehicle: true },
  });
  if (!listing) return errorResponse("Annonce introuvable", 404);

  const inventoryPrice = listing.vehicle.price == null ? null : Number(listing.vehicle.price);
  if (inventoryPrice == null || Math.round(data.price) !== Math.round(inventoryPrice)) {
    return errorResponse(
      "Le prix confirmé doit correspondre au prix de l'inventaire",
      422,
    );
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      marketplacePrice: data.price,
      lastPriceConfirmedAt: new Date(),
      events: {
        create: {
          eventType: "price_updated",
          metadata: {
            from: listing.marketplacePrice ?? listing.priceAtListing,
            to: data.price,
          },
        },
      },
    },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "listing",
    entityId: listing.id,
    metadata: { action: "confirm_price", price: data.price },
    request: request as never,
  });

  return jsonResponse({ ...updated, message: "Prix confirmé sur Marketplace." });
});
