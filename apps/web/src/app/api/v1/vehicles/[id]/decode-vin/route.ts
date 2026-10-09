import {
  decodeVin,
  emptyFieldsFromVinDecode,
  vinDecodeErrorMessageFr,
} from "@okauto/shared";
import { prisma } from "@okauto/database";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";

export const POST = withAuth(async (_request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!vehicle) return errorResponse("Véhicule introuvable", 404);
  if (!vehicle.vin) return errorResponse("Ce véhicule n’a pas de NIV", 400);

  const decoded = await decodeVin(vehicle.vin);
  if (decoded.error) {
    const status = /NHTSA API error/i.test(decoded.error) ? 503 : 400;
    return errorResponse(vinDecodeErrorMessageFr(decoded.error), status);
  }

  const { patch, filled, skipped } = emptyFieldsFromVinDecode(vehicle, decoded);
  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      year: patch.year as number | undefined,
      make: patch.make as string | undefined,
      model: patch.model as string | undefined,
      trim: patch.trim as string | undefined,
      bodyStyle: patch.bodyStyle as string | undefined,
      engine: patch.engine as string | undefined,
      fuelType: patch.fuelType as string | undefined,
      transmission: patch.transmission as string | undefined,
      drivetrain: patch.drivetrain as string | undefined,
      doors: patch.doors as number | undefined,
      cylinders: patch.cylinders as number | undefined,
      vinDecodedAt: new Date(),
      vinDecodedVin: decoded.vin,
    },
    include: { photos: true },
  });

  return jsonResponse({ vehicle: updated, decode: decoded, filled, skipped });
});
