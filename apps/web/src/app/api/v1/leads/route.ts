import { prisma } from "@okauto/database";
import { createLeadSchema, leadQuerySchema } from "@okauto/shared";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";
import { hasMinRole } from "@okauto/shared";

export const GET = withAuth(async (request, { auth }) => {
  const url = new URL(request.url);
  const query = leadQuerySchema.parse(Object.fromEntries(url.searchParams));
  const canSeeAll = hasMinRole(auth.role, "MANAGER");

  const where: Record<string, unknown> = {
    organizationId: auth.orgId,
  };
  if (!canSeeAll) {
    where.OR = [{ createdById: auth.sub }, { assignedToId: auth.sub }];
  }
  if (query.status) where.status = query.status;
  if (query.search) {
    where.AND = [
      {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { phone: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.marketplaceLead.findMany({
      where,
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
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.marketplaceLead.count({ where }),
  ]);

  const counts = await prisma.marketplaceLead.groupBy({
    by: ["status"],
    where: { organizationId: auth.orgId },
    _count: { _all: true },
  });

  return jsonResponse({
    leads,
    counts: Object.fromEntries(
      counts.map((row) => [row.status, row._count._all]),
    ),
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
  const data = createLeadSchema.parse(body);

  if (data.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
      select: { id: true },
    });
    if (!vehicle) {
      return jsonResponse({ error: "Véhicule introuvable" }, 404);
    }
  }

  const lead = await prisma.marketplaceLead.create({
    data: {
      organizationId: auth.orgId,
      createdById: auth.sub,
      assignedToId: data.assignedToId || auth.sub,
      vehicleId: data.vehicleId,
      listingId: data.listingId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      message: data.message,
      source: data.source,
      nextFollowUpAt: data.nextFollowUpAt
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
    action: "CREATE",
    entityType: "marketplace_lead",
    entityId: lead.id,
    request: request as never,
  });

  return jsonResponse({ lead }, 201);
});
