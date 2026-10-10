import { prisma } from "@okauto/database";
import {
  confirmFeedAbsenceSchema,
  staleUnseenReviewReason,
} from "@okauto/shared";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { confirmFeedAbsenceVehicles } from "@/lib/services";
import { createAuditLog } from "@/lib/auth";
import { staleUnseenVehicleIds } from "@/lib/on-sale-query";

export const GET = withAuth(async (_request, { auth }) => {
  const staleUnseenIds = await staleUnseenVehicleIds(auth.orgId);
  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: auth.orgId,
      status: { in: ["AVAILABLE", "PENDING"] },
      OR: [
        { feedAbsenceStatus: "PENDING_REVIEW" },
        ...(staleUnseenIds.length > 0 ? [{ id: { in: staleUnseenIds } }] : []),
      ],
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

  const staleIdSet = new Set(staleUnseenIds);
  return jsonResponse({
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      reviewReason:
        vehicle.feedAbsenceStatus === "PENDING_REVIEW"
          ? "absent du flux"
          : vehicle.lastSeenAt && staleIdSet.has(vehicle.id)
            ? staleUnseenReviewReason(vehicle.lastSeenAt)
            : null,
      confirmable: vehicle.feedAbsenceStatus === "PENDING_REVIEW",
    })),
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
