import { prisma } from "@okauto/database";
import {
  vehicleQuerySchema,
  createVehicleSchema,
  vinDecodeStampFromCreate,
  soldHistoryVehicleWhere,
} from "@okauto/shared";
import { onSaleInventoryWhere } from "@/lib/on-sale-query";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const GET = withAuth(async (request, { auth }) => {
  const url = new URL(request.url);
  const query = vehicleQuerySchema.parse(Object.fromEntries(url.searchParams));

  const where: Record<string, unknown> = { organizationId: auth.orgId };

  if (query.scope === "sold" || query.status === "SOLD") {
    Object.assign(where, soldHistoryVehicleWhere());
  } else if (query.status === "ARCHIVED") {
    where.status = "ARCHIVED";
  } else {
    Object.assign(where, await onSaleInventoryWhere(auth.orgId));
    if (query.status === "AVAILABLE" || query.status === "PENDING") {
      where.status = query.status;
    }
  }
  if (query.assignedToId) where.assignedToId = query.assignedToId;
  if (query.withoutActiveListing) {
    where.listings = {
      none: { status: "ACTIVE", userId: auth.sub },
    };
  }
  if (query.search) {
    where.OR = [
      { make: { contains: query.search, mode: "insensitive" } },
      { model: { contains: query.search, mode: "insensitive" } },
      { vin: { contains: query.search, mode: "insensitive" } },
      { stockNumber: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const demoVehicleSignals = [
    { condition: { contains: "demo", mode: "insensitive" } },
    { stockNumber: { contains: "-DEMO", mode: "insensitive" } },
    { sourceUrl: { contains: "/demonstrateurs/", mode: "insensitive" } },
  ];
  const usedSourceSignals = [
    { sourceUrl: { contains: "/occasion/", mode: "insensitive" } },
    { condition: { equals: "Used", mode: "insensitive" } },
    { condition: { equals: "Usagé", mode: "insensitive" } },
  ];
  const newVehicleSignals = [
    { stockNumber: { contains: "-NEUF", mode: "insensitive" } },
    { sourceUrl: { contains: "/neufs/", mode: "insensitive" } },
    {
      AND: [
        {
          OR: [
            { condition: { equals: "New", mode: "insensitive" } },
            { condition: { equals: "Neuf", mode: "insensitive" } },
          ],
        },
        { OR: [{ mileage: null }, { mileage: { lte: 1_000 } }] },
        { NOT: { OR: usedSourceSignals } },
      ],
    },
  ];

  if (query.inventoryType === "NEW") {
    where.AND = [
      { OR: newVehicleSignals },
      { NOT: { OR: demoVehicleSignals } },
    ];
  } else if (query.inventoryType === "DEMO") {
    where.AND = [{ OR: demoVehicleSignals }];
  } else if (query.inventoryType === "USED") {
    where.AND = [
      { NOT: { OR: [...newVehicleSignals, ...demoVehicleSignals] } },
    ];
  }

  const vehicleQuery = {
    where,
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        ...(query.view === "summary" ? { take: 1 } : {}),
      },
      assignedTo: { select: { id: true, name: true, email: true } },
      listings: {
        where: { status: "ACTIVE" as const, userId: auth.sub },
        take: 1,
      },
      _count: {
        select: { listings: { where: { userId: auth.sub } } },
      },
    },
    orderBy: { updatedAt: "desc" as const },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  };

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany(vehicleQuery),
    prisma.vehicle.count({ where }),
  ]);

  return jsonResponse({
    vehicles,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

export const POST = withAuth(async (request, { auth }) => {
  const body = await parseBody<unknown>(request);
  const parsed = createVehicleSchema.parse(body);
  const { vinDecoded, ...data } = parsed;
  const vinStamp = vinDecodeStampFromCreate({
    vin: data.vin,
    vinDecoded,
    vinDecodedFields: data.vinDecodedFields,
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: auth.orgId,
      vin: data.vin,
      stockNumber: data.stockNumber,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      bodyStyle: data.bodyStyle,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      mileage: data.mileage,
      price: data.price,
      msrp: data.msrp,
      description: data.description,
      features: data.features ?? [],
      status: data.status ?? "AVAILABLE",
      fuelType: data.fuelType,
      transmission: data.transmission,
      drivetrain: data.drivetrain,
      engine: data.engine,
      doors: data.doors,
      cylinders: data.cylinders,
      condition: data.condition,
      location: data.location,
      notes: data.notes,
      assignedToId: data.assignedToId,
      ...vinStamp,
      photos: data.photos
        ? {
            create: data.photos.map((p, i) => ({
              url: p.url,
              sortOrder: p.sortOrder ?? i,
              isPrimary: p.isPrimary ?? i === 0,
            })),
          }
        : undefined,
    },
    include: { photos: true, assignedTo: { select: { id: true, name: true } } },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "CREATE",
    entityType: "vehicle",
    entityId: vehicle.id,
    request: request as never,
  });

  return jsonResponse(vehicle, 201);
});
