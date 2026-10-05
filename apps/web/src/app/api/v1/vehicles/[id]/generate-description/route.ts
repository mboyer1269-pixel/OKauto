import { prisma } from "@okauto/database";
import { generateMarketplaceTitle, resolveListingLocale } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { generateVehicleDescription } from "@/lib/services";

export const POST = withAuth(async (request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
    include: { photos: { orderBy: { sortOrder: "asc" } }, organization: true },
  });
  if (!vehicle) return errorResponse("Vehicle not found", 404);

  const url = new URL(request.url);
  const locale = resolveListingLocale(
    url.searchParams.get("locale") ?? vehicle.organization.listingLocale,
  );
  const generated = await generateVehicleDescription(
    vehicle.id,
    auth.orgId,
    auth.sub,
    locale,
  );
  const { description } = generated;

  const title = generateMarketplaceTitle({
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
  });
  const draft = await prisma.marketplaceDraft.upsert({
    where: {
      organizationId_userId_vehicleId_platform: {
        organizationId: auth.orgId,
        userId: auth.sub,
        vehicleId: vehicle.id,
        platform: "facebook_marketplace",
      },
    },
    create: {
      organizationId: auth.orgId,
      userId: auth.sub,
      vehicleId: vehicle.id,
      title,
      description,
      locale: generated.locale,
      descriptionEn: generated.descriptionEn,
      photoOrder: vehicle.photos.map((photo) => photo.url),
      generationSource: generated.source,
      dataSnapshot: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        price: vehicle.price == null ? null : Number(vehicle.price),
        stockNumber: vehicle.stockNumber,
        vin: vehicle.vin,
      },
    },
    update: {
      title,
      description,
      locale: generated.locale,
      descriptionEn: generated.descriptionEn,
      photoOrder: vehicle.photos.map((photo) => photo.url),
      generationSource: generated.source,
      dataSnapshot: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        price: vehicle.price == null ? null : Number(vehicle.price),
        stockNumber: vehicle.stockNumber,
        vin: vehicle.vin,
      },
    },
  });

  return jsonResponse({ description, draft });
});
