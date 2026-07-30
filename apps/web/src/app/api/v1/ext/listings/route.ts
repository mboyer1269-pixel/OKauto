import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, parseBody, requireApiToken } from "@/server/api";
import { createListing, transitionListing } from "@/server/listings";

const createSchema = z.object({
  vehicleId: z.string().min(1),
  force: z.boolean().default(false),
});

/** Extension: start a listing (DRAFT) and immediately mark it PREPARED. */
export const POST = handler(async (req) => {
  const ctx = await requireApiToken(req);
  const body = await parseBody(req, createSchema);

  const { listing, duplicateWarning } = await createListing({
    organizationId: ctx.organizationId,
    vehicleId: body.vehicleId,
    userId: ctx.user.id,
    force: body.force,
  });
  const prepared = await transitionListing({
    listingId: listing.id,
    organizationId: ctx.organizationId,
    actorId: ctx.user.id,
    status: "PREPARED",
  });
  await audit(req, {
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    action: "listing.create",
    entityType: "listing",
    entityId: listing.id,
    data: { via: "extension", vehicleId: body.vehicleId },
  });
  return json({ listing: prepared, duplicateWarning }, { status: 201 });
});

/** Extension: the user's own listings (for delist reminders and history). */
export const GET = handler(async (req) => {
  const ctx = await requireApiToken(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const listings = await prisma.listing.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      vehicle: {
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          trim: true,
          stockNumber: true,
          status: true,
        },
      },
    },
  });
  return json({ listings });
});
