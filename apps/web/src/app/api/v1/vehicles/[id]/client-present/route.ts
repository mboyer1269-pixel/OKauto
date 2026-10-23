import { prisma } from "@okauto/database";
import { ApiErrorCode } from "@okauto/shared";
import { withAuth, jsonResponse, apiError } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const POST = withAuth(async (request, { auth, params }) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);

  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { status: "PENDING" },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "vehicle",
    entityId: vehicle.id,
    metadata: { action: "client_present", previousStatus: vehicle.status },
    request: request as never,
  });

  return jsonResponse({ success: true, vehicle: updated });
});
