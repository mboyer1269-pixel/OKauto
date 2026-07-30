import { normalizeVehicle, vehicleInputSchema } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { audit, badRequest, handler, json, notFound, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; vehicleId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId, vehicleId } = await ctx.params;
  await requireOrgRole(req, orgId);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId: orgId },
    include: {
      photos: { orderBy: { position: "asc" } },
      priceHistory: { orderBy: { detectedAt: "desc" }, take: 10 },
      listings: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      source: { select: { id: true, name: true, type: true } },
    },
  });
  if (!vehicle) throw notFound("Vehicle not found");
  return json({ vehicle });
});

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { orgId, vehicleId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);

  const existing = await prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId: orgId } });
  if (!existing) throw notFound("Vehicle not found");

  const raw = (await req.json().catch(() => {
    throw badRequest("Request body must be valid JSON");
  })) as Record<string, unknown>;

  // Salespeople may only update the description (their listing prep surface);
  // managers and owners can edit everything.
  const isManager = membership.role !== "SALESPERSON";
  const data: Record<string, unknown> = {};

  if (typeof raw.description === "string") {
    data.description = raw.description.slice(0, 10_000);
    data.descriptionSource = "MANUAL";
  }

  if (isManager) {
    const editable = vehicleInputSchema.partial().safeParse(raw);
    if (!editable.success) throw badRequest("Validation failed", editable.error.flatten());
    const merged = normalizeVehicle({
      ...existing,
      priceCents: existing.priceCents,
      ...Object.fromEntries(Object.entries(editable.data).filter(([, v]) => v !== undefined)),
      make: (editable.data.make ?? existing.make) as string,
      model: (editable.data.model ?? existing.model) as string,
    });
    if ("error" in merged) throw badRequest(merged.error);
    const { issues: _issues, photoUrls, sourceRef: _ref, description: _desc, ...fields } = merged;
    Object.assign(data, fields);
    if (editable.data.priceCents !== undefined && editable.data.priceCents !== existing.priceCents) {
      data.previousPriceCents = existing.priceCents;
      if (existing.priceCents != null && editable.data.priceCents != null) {
        await prisma.priceChange.create({
          data: {
            vehicleId,
            oldPriceCents: existing.priceCents,
            newPriceCents: editable.data.priceCents,
          },
        });
      }
    }
    if (Array.isArray(raw.photoUrls)) {
      await prisma.vehiclePhoto.deleteMany({ where: { vehicleId } });
      await prisma.vehiclePhoto.createMany({
        data: photoUrls.map((url, position) => ({ vehicleId, url, position })),
      });
    }
    if (typeof raw.status === "string" && ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"].includes(raw.status)) {
      data.status = raw.status;
      data.soldAt = raw.status === "SOLD" ? new Date() : null;
      if (raw.status === "SOLD") {
        await prisma.listing.updateMany({
          where: { vehicleId, status: "POSTED" },
          data: { status: "DELIST_REQUESTED" },
        });
        const listings = await prisma.listing.findMany({
          where: { vehicleId, status: { in: ["DELIST_REQUESTED", "PREPARED"] } },
          distinct: ["userId"],
        });
        for (const listing of listings) {
          await prisma.notification.create({
            data: {
              organizationId: orgId,
              userId: listing.userId,
              type: "VEHICLE_SOLD",
              title: "Vehicle sold — delist your Marketplace post",
              body: `${[existing.year, existing.make, existing.model].filter(Boolean).join(" ")} was marked sold. Please remove your Facebook Marketplace listing.`,
              data: { vehicleId, listingId: listing.id },
            },
          });
        }
      }
    }
  } else if (Object.keys(data).length === 0) {
    throw badRequest("Salespeople can only update the vehicle description");
  }

  const vehicle = await prisma.vehicle.update({
    where: { id: vehicleId },
    data,
    include: { photos: { orderBy: { position: "asc" } } },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "vehicle.update",
    entityType: "vehicle",
    entityId: vehicleId,
    data: { fields: Object.keys(data) },
  });
  return json({ vehicle });
});

export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { orgId, vehicleId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const existing = await prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId: orgId } });
  if (!existing) throw notFound("Vehicle not found");
  // Soft delete: archive rather than destroy listing history.
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: "ARCHIVED" } });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "vehicle.archive",
    entityType: "vehicle",
    entityId: vehicleId,
  });
  return json({ ok: true });
});
