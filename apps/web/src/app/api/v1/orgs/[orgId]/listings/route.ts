import { LISTING_STATUSES } from "@lotpilot/core";
import { prisma, type Prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, pageParams, parseBody, requireOrgRole } from "@/server/api";
import { createListing } from "@/server/listings";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pageParams(url);

  const where: Prisma.ListingWhereInput = { organizationId: orgId };
  const status = url.searchParams.get("status");
  if (status && (LISTING_STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof LISTING_STATUSES)[number];
  }
  const mine = url.searchParams.get("mine") === "1";
  const userId = url.searchParams.get("userId");
  if (mine || membership.role === "SALESPERSON") {
    // Salespeople always see their own listings only.
    where.userId = mine || membership.role === "SALESPERSON" ? user.id : undefined;
  } else if (userId) {
    where.userId = userId;
  }

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        vehicle: {
          select: {
            id: true, year: true, make: true, model: true, trim: true,
            stockNumber: true, priceCents: true, status: true,
            photos: { orderBy: { position: "asc" }, take: 1 },
          },
        },
        user: { select: { id: true, name: true } },
      },
    }),
  ]);
  return json({ listings, page, pageSize, total });
});

const createSchema = z.object({
  vehicleId: z.string().min(1),
  force: z.boolean().default(false),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId);
  const body = await parseBody(req, createSchema);

  const { listing, duplicateWarning } = await createListing({
    organizationId: orgId,
    vehicleId: body.vehicleId,
    userId: user.id,
    force: body.force,
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "listing.create",
    entityType: "listing",
    entityId: listing.id,
    data: { vehicleId: body.vehicleId },
  });
  return json({ listing, duplicateWarning }, { status: 201 });
});
