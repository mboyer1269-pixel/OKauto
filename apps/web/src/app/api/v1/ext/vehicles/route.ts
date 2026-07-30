import { toMarketplaceFields } from "@lotpilot/core";
import { prisma, type Prisma } from "@lotpilot/db";
import { handler, json, pageParams, requireApiToken } from "@/server/api";

/**
 * Listable inventory for the extension. Each vehicle ships with pre-computed
 * Facebook Marketplace form fields plus who (if anyone) already listed it.
 */
export const GET = handler(async (req) => {
  const ctx = await requireApiToken(req);
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pageParams(url, 20, 50);
  const q = url.searchParams.get("q")?.trim();

  const where: Prisma.VehicleWhereInput = {
    organizationId: ctx.organizationId,
    status: "AVAILABLE",
  };
  if (q) {
    where.OR = [
      { vin: { contains: q, mode: "insensitive" } },
      { stockNumber: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        photos: { orderBy: { position: "asc" } },
        listings: {
          where: { status: { in: ["PREPARED", "POSTED", "DELIST_REQUESTED"] } },
          select: { id: true, status: true, userId: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  return json({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      vin: v.vin,
      stockNumber: v.stockNumber,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      mileage: v.mileage,
      priceCents: v.priceCents,
      status: v.status,
      description: v.description,
      photos: v.photos.map((p) => p.url),
      marketplaceFields: toMarketplaceFields(v),
      activeListings: v.listings.map((l) => ({
        id: l.id,
        status: l.status,
        mine: l.userId === ctx.user.id,
        by: l.user.name,
      })),
    })),
    page,
    pageSize,
    total,
  });
});
