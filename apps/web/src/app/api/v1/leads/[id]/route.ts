import { prisma } from "@okauto/database";
import { updateLeadSchema } from "@okauto/shared";
import {
  errorResponse,
  jsonResponse,
  parseBody,
  withAuth,
} from "@/lib/api";
import { createAuditLog } from "@/lib/auth";
import { hasMinRole } from "@okauto/shared";

export const PATCH = withAuth(async (request, { auth, params }) => {
  const existing = await prisma.marketplaceLead.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!existing) return errorResponse("Lead introuvable", 404);

  const canManageAll = hasMinRole(auth.role, "MANAGER");
  if (
    !canManageAll &&
    existing.createdById !== auth.sub &&
    existing.assignedToId !== auth.sub
  ) {
    return errorResponse("Accès insuffisant", 403);
  }

  const body = await parseBody<unknown>(request);
  const data = updateLeadSchema.parse(body);

  const lead = await prisma.marketplaceLead.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email === undefined ? undefined : data.email || null,
      message: data.message,
      source: data.source,
      status: data.status,
      vehicleId: data.vehicleId,
      listingId: data.listingId,
      assignedToId: data.assignedToId,
      nextFollowUpAt:
        data.nextFollowUpAt === undefined
          ? undefined
          : data.nextFollowUpAt
            ? new Date(data.nextFollowUpAt)
            : null,
    },
    include: {
      vehicle: {
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          stockNumber: true,
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "marketplace_lead",
    entityId: lead.id,
    request: request as never,
  });

  return jsonResponse({ lead });
});
