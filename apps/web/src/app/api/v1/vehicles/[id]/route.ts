import { prisma } from "@okauto/database";
import { normalizeVin, updateVehicleSchema } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";
import { notifySoldVehicle } from "@/lib/services";

export const GET = withAuth(async (_request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
    include: {
      organization: { select: { includeCarfaxSourceUrl: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      assignedTo: { select: { id: true, name: true, email: true } },
      listings: {
        where: { userId: auth.sub },
        orderBy: { listedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      marketplaceDrafts: {
        where: { userId: auth.sub, platform: "facebook_marketplace" },
        take: 1,
      },
    },
  });

  if (!vehicle) return errorResponse("Vehicle not found", 404);
  return jsonResponse(vehicle);
});

export const PATCH = withAuth(async (request, { auth, params }) => {
  const body = await parseBody<unknown>(request);
  const data = updateVehicleSchema.parse(body);

  const existing = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!existing) return errorResponse("Vehicle not found", 404);

  const wasSold = existing.status !== "SOLD" && data.status === "SOLD";
  const vinChanged =
    data.vin !== undefined &&
    normalizeVin(data.vin ?? "") !== normalizeVin(existing.vin ?? "");

  const vehicle = await prisma.vehicle.update({
    where: { id: params!.id },
    data: {
      vin: data.vin,
      stockNumber: data.stockNumber,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      bodyStyle: data.bodyStyle,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      mileage: data.mileage,
      price: data.price,
      msrp: data.msrp,
      description: data.description,
      features: data.features,
      status: data.status,
      fuelType: data.fuelType,
      transmission: data.transmission,
      drivetrain: data.drivetrain,
      engine: data.engine,
      doors: data.doors,
      cylinders: data.cylinders,
      condition: data.condition,
      location: data.location,
      notes: data.notes,
      assignedToId: data.assignedToId === null ? null : data.assignedToId,
      includeCarfaxSourceUrl: data.includeCarfaxSourceUrl,
      ...(vinChanged
        ? {
            vinDecodedAt: null,
            vinDecodedVin: null,
            vinDecodedFields: [],
            vinDecodeAttempts: 0,
            vinDecodeError: null,
            vinDecodeLastAttemptAt: null,
          }
        : {}),
      soldAt: wasSold
        ? new Date()
        : data.status === "SOLD"
          ? existing.soldAt
          : undefined,
    },
    include: { photos: true, assignedTo: { select: { id: true, name: true } } },
  });

  if (wasSold) {
    await notifySoldVehicle(vehicle.id, auth.orgId);
  }

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "vehicle",
    entityId: vehicle.id,
    metadata: { changes: data },
    request: request as never,
  });

  return jsonResponse(vehicle);
});

export const DELETE = withAuth(
  async (request, { auth, params }) => {
    const existing = await prisma.vehicle.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!existing) return errorResponse("Vehicle not found", 404);

    await prisma.vehicle.delete({ where: { id: params!.id } });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "DELETE",
      entityType: "vehicle",
      entityId: params!.id,
      request: request as never,
    });

    return jsonResponse({ success: true });
  },
  { minRole: "MANAGER" },
);
