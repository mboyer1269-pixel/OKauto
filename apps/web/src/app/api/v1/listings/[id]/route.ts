import { prisma } from "@okauto/database";
import {
  ApiErrorCode,
  hasMinRole,
  listingExternalIdentityFromUrl,
  updateListingSchema,
} from "@okauto/shared";
import { withAuth, jsonResponse, apiError, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const PATCH = withAuth(async (request, { auth, params }) => {
  const body = await parseBody<unknown>(request);
  const data = updateListingSchema.parse(body);

  const existing = await prisma.listing.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      ...(hasMinRole(auth.role, "MANAGER") ? {} : { userId: auth.sub }),
    },
  });
  if (!existing) return apiError(ApiErrorCode.LISTING_NOT_FOUND, 404);

  const listing = await prisma.listing.update({
    where: { id: params!.id },
    data: {
      status: data.status,
      ...(data.externalUrl !== undefined
        ? listingExternalIdentityFromUrl(data.externalUrl)
        : {}),
      removedAt:
        data.status === "REMOVED"
          ? new Date()
          : data.removedAt
            ? new Date(data.removedAt)
            : undefined,
      lastRenewedAt: data.renew ? new Date() : undefined,
      renewalCount: data.renew ? { increment: 1 } : undefined,
      events: {
        create: {
          eventType: data.renew
            ? "listing_renewed"
            : data.status === "REMOVED"
              ? "listing_removed"
              : data.status
                ? `status_${data.status.toLowerCase()}`
                : "listing_updated",
          metadata: {
            previousStatus: existing.status,
            externalUrlChanged:
              data.externalUrl !== undefined &&
              data.externalUrl !== existing.externalUrl,
            source: "dashboard",
            renew: Boolean(data.renew),
            confirmedBy: auth.sub,
          },
        },
      },
    },
    include: { vehicle: true, user: { select: { id: true, name: true } } },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "UPDATE",
    entityType: "listing",
    entityId: listing.id,
    request: request as never,
  });

  return jsonResponse(listing);
});
