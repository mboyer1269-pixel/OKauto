import { prisma } from "@okauto/database";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";
import { generateVehicleDescription } from "@/lib/services";

export const POST = withAuth(async (_request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!vehicle) return errorResponse("Vehicle not found", 404);

  const description = await generateVehicleDescription(
    vehicle.id,
    auth.orgId,
    auth.sub,
  );

  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { description },
  });

  return jsonResponse({ description, vehicle: updated });
});
