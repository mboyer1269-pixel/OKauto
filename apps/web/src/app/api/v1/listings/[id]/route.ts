import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@okauto/db";
import { ListingStatusSchema } from "@okauto/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const ListingPatchSchema = z.object({
  status: ListingStatusSchema.optional(),
  marketplaceUrl: z.string().url().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).optional()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to update listings.", 401);
  }

  if (!hasAnyRole(session, ["OWNER", "MANAGER", "SALESPERSON"])) {
    return jsonError("FORBIDDEN", "Your role cannot update listings.", 403);
  }

  const { id } = await context.params;
  const body = ListingPatchSchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError("INVALID_LISTING_PATCH", body.error.issues.map((issue) => issue.message).join("; "), 422);
  }

  const listing = await prisma.listing.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { vehicle: true }
  });

  if (!listing) {
    return jsonError("LISTING_NOT_FOUND", "Listing does not exist in this organization.", 404);
  }

  const updated = await prisma.listing.update({
    where: { id },
    data: {
      status: body.data.status,
      marketplaceUrl: body.data.marketplaceUrl,
      assignedToUserId: body.data.assignedToUserId,
      postedAt: body.data.status === "POSTED" && !listing.postedAt ? new Date() : listing.postedAt,
      removedAt: body.data.status === "REMOVED" && !listing.removedAt ? new Date() : listing.removedAt,
      snapshots: body.data.status
        ? {
            create: {
              status: body.data.status,
              price: listing.price,
              notes: body.data.notes
            }
          }
        : undefined
    }
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      actorUserId: session.userId,
      vehicleId: listing.vehicleId,
      listingId: listing.id,
      action: `updated_listing_${updated.status.toLowerCase()}`,
      metadata: { notes: body.data.notes }
    }
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
