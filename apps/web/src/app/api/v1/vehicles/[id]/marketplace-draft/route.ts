import { prisma } from "@okauto/database";
import { updateMarketplaceDraftSchema } from "@okauto/shared";
import { errorResponse, jsonResponse, parseBody, withAuth } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const PUT = withAuth(async (request, { auth, params }) => {
  const body = await parseBody<unknown>(request);
  const data = updateMarketplaceDraftSchema.parse(body);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
    include: { photos: { orderBy: { sortOrder: "asc" } } },
  });
  if (!vehicle) return errorResponse("Vehicle not found", 404);

  const availablePhotoUrls = new Set(vehicle.photos.map((photo) => photo.url));
  const requestedOrder = data.photoOrder?.filter((url) =>
    availablePhotoUrls.has(url),
  );
  const photoOrder = requestedOrder?.length
    ? requestedOrder
    : vehicle.photos.map((photo) => photo.url).slice(0, 20);

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
      platform: "facebook_marketplace",
      title: data.title,
      description: data.description,
      photoOrder,
      generationSource: "manual",
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
      title: data.title,
      description: data.description,
      photoOrder,
      generationSource: "manual",
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

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "marketplace_draft",
    entityId: draft.id,
    metadata: { vehicleId: vehicle.id, platform: draft.platform },
    request: request as never,
  });

  return jsonResponse({ draft });
});
