import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@okauto/db";
import {
  DescribeVehicleSchema,
  FeedConfigSchema,
  VehicleCreateSchema,
  VehicleUpdateSchema,
  normalizeVin,
  vehicleTitle,
} from "@okauto/shared";
import { authenticate, requireOrgPermission } from "../plugins/auth.js";
import { writeAudit, notifyUsers } from "../services/audit.js";
import { importVehiclesFromCsv } from "../services/inventory.js";
import { generateVehicleDescription } from "../services/describe.js";
import { decodeVin } from "../services/vin.js";

export async function vehicleRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId/vehicles",
    { preHandler: [authenticate, requireOrgPermission("inventory:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const q = request.query as {
        status?: string;
        search?: string;
        take?: string;
        skip?: string;
      };
      const take = Math.min(Number(q.take ?? 50), 200);
      const skip = Number(q.skip ?? 0);
      const where = {
        organizationId: orgId,
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.search
          ? {
              OR: [
                { make: { contains: q.search, mode: "insensitive" as const } },
                { model: { contains: q.search, mode: "insensitive" as const } },
                { vin: { contains: q.search.toUpperCase() } },
                { stockNumber: { contains: q.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.vehicle.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take,
          skip,
          include: {
            _count: { select: { listings: true } },
          },
        }),
        prisma.vehicle.count({ where }),
      ]);
      return { items, total, take, skip };
    },
  );

  app.get(
    "/v1/orgs/:orgId/vehicles/:vehicleId",
    { preHandler: [authenticate, requireOrgPermission("inventory:read")] },
    async (request, reply) => {
      const { orgId, vehicleId } = request.params as {
        orgId: string;
        vehicleId: string;
      };
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
        include: {
          listings: { orderBy: { createdAt: "desc" }, take: 20 },
          priceHistory: { orderBy: { notedAt: "desc" }, take: 20 },
        },
      });
      if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });
      return { vehicle };
    },
  );

  app.post(
    "/v1/orgs/:orgId/vehicles",
    { preHandler: [authenticate, requireOrgPermission("inventory:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = VehicleCreateSchema.parse(request.body);
      const vin = normalizeVin(body.vin ?? null);

      if (vin) {
        const dup = await prisma.vehicle.findUnique({
          where: { organizationId_vin: { organizationId: orgId, vin } },
        });
        if (dup) {
          return reply.code(409).send({
            error: "Duplicate VIN",
            code: "DUPLICATE_VIN",
            details: { existingVehicleId: dup.id },
          });
        }
      }

      let enriched = { ...body, vin };
      if (vin && (!body.make || body.make === "Unknown")) {
        const decoded = await decodeVin(vin);
        if (decoded) {
          enriched = {
            ...enriched,
            year: decoded.year ?? body.year,
            make: decoded.make ?? body.make,
            model: decoded.model ?? body.model,
            bodyStyle: decoded.bodyStyle ?? body.bodyStyle,
            fuelType: decoded.fuelType ?? body.fuelType,
            drivetrain: decoded.drivetrain ?? body.drivetrain,
          };
        }
      }

      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: orgId,
          vin: enriched.vin ?? null,
          stockNumber: enriched.stockNumber ?? null,
          year: enriched.year,
          make: enriched.make,
          model: enriched.model,
          trim: enriched.trim ?? null,
          priceCents: enriched.priceCents,
          mileage: enriched.mileage ?? null,
          bodyStyle: enriched.bodyStyle ?? null,
          exteriorColor: enriched.exteriorColor ?? null,
          interiorColor: enriched.interiorColor ?? null,
          transmission: enriched.transmission ?? null,
          fuelType: enriched.fuelType ?? null,
          drivetrain: enriched.drivetrain ?? null,
          description: enriched.description ?? null,
          photoUrls: enriched.photoUrls ?? [],
          attributes: (enriched.attributes ?? {}) as Prisma.InputJsonValue,
          status: enriched.status ?? "available",
        },
      });

      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "vehicle.create",
        entity: "vehicle",
        entityId: vehicle.id,
      });

      return reply.code(201).send({ vehicle });
    },
  );

  app.patch(
    "/v1/orgs/:orgId/vehicles/:vehicleId",
    { preHandler: [authenticate, requireOrgPermission("inventory:write")] },
    async (request, reply) => {
      const { orgId, vehicleId } = request.params as {
        orgId: string;
        vehicleId: string;
      };
      const body = VehicleUpdateSchema.parse(request.body);
      const existing = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
      });
      if (!existing) return reply.code(404).send({ error: "Vehicle not found" });

      if (body.priceCents != null && body.priceCents !== existing.priceCents) {
        await prisma.vehiclePriceHistory.create({
          data: { vehicleId, priceCents: body.priceCents },
        });
      }

      const becameSold =
        body.status === "sold" && existing.status !== "sold";

      const { attributes, vin, ...rest } = body;
      const vehicle = await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...rest,
          ...(attributes !== undefined
            ? { attributes: attributes as Prisma.InputJsonValue }
            : {}),
          vin: vin !== undefined ? normalizeVin(vin) : undefined,
        },
      });

      if (becameSold) {
        const activeListings = await prisma.listing.findMany({
          where: {
            vehicleId,
            status: { in: ["posted", "ready"] },
          },
        });
        const userIds = [
          ...new Set(activeListings.map((l) => l.userId).concat(request.user!.id)),
        ];
        await prisma.listing.updateMany({
          where: { id: { in: activeListings.map((l) => l.id) } },
          data: { status: "needs_removal" },
        });
        for (const listing of activeListings) {
          await prisma.listingEvent.create({
            data: {
              listingId: listing.id,
              type: "needs_removal",
              meta: { reason: "vehicle_sold" },
            },
          });
        }
        await notifyUsers({
          organizationId: orgId,
          userIds,
          type: "vehicle_sold",
          title: "Vehicle sold — remove Marketplace listing",
          body: `${vehicleTitle(vehicle)} was marked sold. Remove any active Marketplace posts.`,
          meta: { vehicleId },
        });
      }

      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "vehicle.update",
        entity: "vehicle",
        entityId: vehicleId,
        meta: body as Record<string, unknown>,
      });

      return { vehicle };
    },
  );

  app.post(
    "/v1/orgs/:orgId/vehicles/bulk",
    { preHandler: [authenticate, requireOrgPermission("inventory:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = (request.body ?? {}) as {
        vehicleIds?: string[];
        action?: "archive" | "mark_available" | "mark_sold";
      };
      if (!body.vehicleIds?.length || !body.action) {
        return reply.code(400).send({ error: "vehicleIds and action required" });
      }
      const statusMap = {
        archive: "archived",
        mark_available: "available",
        mark_sold: "sold",
      } as const;
      const status = statusMap[body.action];
      const result = await prisma.vehicle.updateMany({
        where: { organizationId: orgId, id: { in: body.vehicleIds } },
        data: { status },
      });
      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: `vehicle.bulk.${body.action}`,
        entity: "vehicle",
        meta: { vehicleIds: body.vehicleIds, count: result.count },
      });
      return { updated: result.count };
    },
  );

  app.post(
    "/v1/orgs/:orgId/vehicles/import",
    { preHandler: [authenticate, requireOrgPermission("inventory:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = request.body as { csv?: string } | undefined;
      let csvText = body?.csv;
      if (!csvText && request.isMultipart?.()) {
        const file = await request.file();
        if (file) {
          csvText = (await file.toBuffer()).toString("utf8");
        }
      }
      if (!csvText) {
        return reply.code(400).send({ error: "CSV content required (csv field or file)" });
      }

      const source = await prisma.inventorySource.create({
        data: {
          organizationId: orgId,
          name: `CSV import ${new Date().toISOString()}`,
          type: "csv",
          health: "healthy",
          lastSyncAt: new Date(),
          lastSuccessAt: new Date(),
        },
      });

      const result = await importVehiclesFromCsv(orgId, csvText, source.id);
      await prisma.inventorySource.update({
        where: { id: source.id },
        data: {
          health: result.errors.length ? "degraded" : "healthy",
          lastError: result.errors[0]?.message ?? null,
          config: { result },
        },
      });

      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "vehicle.import",
        entity: "inventory_source",
        entityId: source.id,
        meta: result as unknown as Record<string, unknown>,
      });

      return { sourceId: source.id, result };
    },
  );

  app.post(
    "/v1/orgs/:orgId/vehicles/:vehicleId/describe",
    { preHandler: [authenticate, requireOrgPermission("listings:write")] },
    async (request, reply) => {
      const { orgId, vehicleId } = request.params as {
        orgId: string;
        vehicleId: string;
      };
      const options = DescribeVehicleSchema.parse(request.body ?? {});
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
      });
      if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

      const generated = await generateVehicleDescription(app.env, vehicle, options);
      const updated = await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { description: generated.description },
      });

      return {
        vehicle: updated,
        provider: generated.provider,
        title: vehicleTitle(vehicle),
      };
    },
  );

  app.get(
    "/v1/orgs/:orgId/inventory-sources",
    { preHandler: [authenticate, requireOrgPermission("inventory:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const sources = await prisma.inventorySource.findMany({
        where: { organizationId: orgId },
        orderBy: { updatedAt: "desc" },
      });
      return { sources };
    },
  );

  app.post(
    "/v1/orgs/:orgId/inventory-sources/feed",
    { preHandler: [authenticate, requireOrgPermission("inventory:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = FeedConfigSchema.parse(request.body);
      const source = await prisma.inventorySource.create({
        data: {
          organizationId: orgId,
          name: body.name,
          type: "feed",
          health: "unknown",
          config: {
            feedUrl: body.feedUrl,
            intervalMinutes: body.intervalMinutes,
          },
        },
      });
      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "inventory_source.create",
        entity: "inventory_source",
        entityId: source.id,
      });
      return reply.code(201).send({ source });
    },
  );
}
