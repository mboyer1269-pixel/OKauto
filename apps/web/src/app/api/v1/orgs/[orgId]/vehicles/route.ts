import { normalizeVehicle, VEHICLE_STATUSES, vehicleInputSchema } from "@lotpilot/core";
import { prisma, type Prisma } from "@lotpilot/db";
import {
  audit,
  badRequest,
  conflict,
  handler,
  json,
  pageParams,
  parseBody,
  requireOrgRole,
} from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId);
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pageParams(url);

  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();
  const make = url.searchParams.get("make")?.trim();
  const listable = url.searchParams.get("listable") === "1";
  const sort = url.searchParams.get("sort") ?? "-createdAt";

  const where: Prisma.VehicleWhereInput = { organizationId: orgId };
  if (status && (VEHICLE_STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof VEHICLE_STATUSES)[number];
  }
  if (listable) {
    where.status = "AVAILABLE";
  }
  if (make) where.make = { equals: make, mode: "insensitive" };
  if (q) {
    where.OR = [
      { vin: { contains: q, mode: "insensitive" } },
      { stockNumber: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { trim: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.VehicleOrderByWithRelationInput =
    sort === "price"
      ? { priceCents: "asc" }
      : sort === "-price"
        ? { priceCents: "desc" }
        : sort === "year"
          ? { year: "asc" }
          : sort === "-year"
            ? { year: "desc" }
            : sort === "createdAt"
              ? { createdAt: "asc" }
              : { createdAt: "desc" };

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        photos: { orderBy: { position: "asc" }, take: 1 },
        listings: {
          where: { status: { in: ["PREPARED", "POSTED", "DELIST_REQUESTED"] } },
          select: { id: true, status: true, userId: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  return json({ vehicles, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const raw = await parseBody(req, vehicleInputSchema);

  const normalized = normalizeVehicle(raw);
  if ("error" in normalized) throw badRequest(normalized.error);

  const { issues, photoUrls, ...fields } = normalized;
  const dupe = await prisma.vehicle.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        ...(fields.vin ? [{ vin: fields.vin }] : []),
        ...(fields.stockNumber ? [{ stockNumber: fields.stockNumber }] : []),
      ],
    },
    select: { id: true, vin: true, stockNumber: true },
  });
  if (dupe) {
    throw conflict(
      `A vehicle with the same ${dupe.vin === fields.vin ? "VIN" : "stock number"} already exists (id ${dupe.id})`,
    );
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      ...fields,
      organizationId: orgId,
      photos: { create: photoUrls.map((url, position) => ({ url, position })) },
    },
    include: { photos: true },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "vehicle.create",
    entityType: "vehicle",
    entityId: vehicle.id,
    data: { vin: vehicle.vin, stockNumber: vehicle.stockNumber },
  });
  return json({ vehicle, warnings: issues }, { status: 201 });
});
