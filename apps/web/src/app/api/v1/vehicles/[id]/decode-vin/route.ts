import { decodeVin } from '@okauto/shared';
import { prisma } from '@okauto/database';
import { withAuth, jsonResponse, errorResponse } from '@/lib/api';

export const POST = withAuth(async (_request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!vehicle) return errorResponse('Vehicle not found', 404);
  if (!vehicle.vin) return errorResponse('Vehicle has no VIN', 400);

  const decoded = await decodeVin(vehicle.vin);
  if (decoded.error) return errorResponse(decoded.error, 400);

  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      year: decoded.year ?? vehicle.year,
      make: decoded.make ?? vehicle.make,
      model: decoded.model ?? vehicle.model,
      trim: decoded.trim ?? vehicle.trim,
      bodyStyle: decoded.bodyStyle ?? vehicle.bodyStyle,
      engine: decoded.engine ?? vehicle.engine,
      fuelType: decoded.fuelType ?? vehicle.fuelType,
      transmission: decoded.transmission ?? vehicle.transmission,
      drivetrain: decoded.drivetrain ?? vehicle.drivetrain,
      doors: decoded.doors ?? vehicle.doors,
      cylinders: decoded.cylinders ?? vehicle.cylinders,
    },
    include: { photos: true },
  });

  return jsonResponse({ vehicle: updated, decode: decoded });
});
