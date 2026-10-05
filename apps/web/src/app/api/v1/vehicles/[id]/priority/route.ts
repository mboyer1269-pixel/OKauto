import { prisma } from "@okauto/database";
import { updateVehiclePrioritySchema } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const PATCH = withAuth(
  async (request, { auth, params }) => {
    const data = updateVehiclePrioritySchema.parse(await parseBody(request));
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!vehicle) return errorResponse("Véhicule introuvable", 404);

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        managerPriority: data.managerPriority,
        managerPriorityNote: data.managerPriority
          ? (data.note ?? vehicle.managerPriorityNote)
          : null,
        managerPriorityById: data.managerPriority ? auth.sub : null,
      },
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "vehicle_priority",
      entityId: vehicle.id,
      metadata: { managerPriority: data.managerPriority, note: data.note },
      request: request as never,
    });

    return jsonResponse(updated);
  },
  { minRole: "MANAGER" },
);
