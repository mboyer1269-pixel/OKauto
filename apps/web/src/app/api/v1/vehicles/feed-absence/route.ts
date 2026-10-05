import { prisma } from "@okauto/database";
import { confirmFeedAbsenceSchema } from "@okauto/shared";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { confirmFeedAbsenceVehicles } from "@/lib/services";
import { createAuditLog } from "@/lib/auth";

export const GET = withAuth(async (_request, { auth }) => {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: auth.orgId,
      status: { in: ["AVAILABLE", "PENDING"] },
      feedAbsenceStatus: "PENDING_REVIEW",
    },
    include: {
      photos: { where: { isPrimary: true }, take: 1 },
      listings: {
        where: { status: { in: ["ACTIVE", "STALE"] } },
        select: { id: true, status: true, externalUrl: true },
        take: 3,
      },
    },
    orderBy: [{ feedAbsenceNotedAt: "asc" }, { createdAt: "asc" }],
  });

  return jsonResponse({
    vehicles,
    total: vehicles.length,
  });
});

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = confirmFeedAbsenceSchema.parse(body);
    const result = await confirmFeedAbsenceVehicles(
      auth.orgId,
      data.vehicleIds,
      data.action,
    );

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "vehicle",
      metadata: {
        feedAbsenceAction: data.action,
        vehicleIds: data.vehicleIds,
        updated: result.updated,
      },
      request: request as never,
    });

    return jsonResponse(result);
  },
  { minRole: "MANAGER" },
);
