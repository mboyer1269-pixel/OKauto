import type { FastifyInstance } from "fastify";
import {
  AppError,
  bulkVehicleActionSchema,
  createVehicleSchema,
  hasPermission,
  updateVehicleSchema,
  vehicleQuerySchema,
} from "@okauto/shared";
import type { Prisma } from "@okauto/db";
import { cursorWhere, toPaginated } from "../../lib/pagination.js";
import { writeAudit } from "../../lib/audit.js";
import { applyImportItems } from "../../services/sync.js";
import { createListing, markVehicleSold, transitionListing } from "../listings/service.js";
import { notificationHub } from "../notifications/hub.js";

async function manualSourceId(app: FastifyInstance, orgId: string): Promise<string> {
  const existing = await app.prisma.importSource.findFirst({ where: { orgId, type: "MANUAL" } });
  if (existing) return existing.id;
  const created = await app.prisma.importSource.create({
    data: { orgId, type: "MANUAL", name: "Manual entry" },
  });
  return created.id;
}

export default async function vehicleRoutes(app: FastifyInstance) {
  app.get("/vehicles", { preHandler: [app.requireOrg("vehicle:read")] }, async (request) => {
    const query = vehicleQuerySchema.parse(request.query);
    const orgId = request.org!.orgId;

    const where: Prisma.VehicleWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.make ? { make: { equals: query.make, mode: "insensitive" } } : {}),
      ...(query.q
        ? {
            OR: [
              { make: { contains: query.q, mode: "insensitive" } },
              { model: { contains: query.q, mode: "insensitive" } },
              { trim: { contains: query.q, mode: "insensitive" } },
              { vin: { contains: query.q.toUpperCase() } },
              { stockNumber: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.minPriceCents != null ? { priceCents: { gte: query.minPriceCents } } : {}),
      ...(query.maxPriceCents != null ? { priceCents: { lte: query.maxPriceCents } } : {}),
      ...(query.hasLiveListing
        ? { listings: { some: { status: "LIVE" } } }
        : {}),
      ...cursorWhere(query.cursor),
    };

    const rows = await app.prisma.vehicle.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: {
        photos: { orderBy: { position: "asc" }, take: 1 },
        listings: {
          where: { status: { in: ["QUEUED", "ASSIGNED", "IN_PROGRESS", "LIVE", "NEEDS_REMOVAL", "ATTENTION"] } },
          select: { id: true, status: true, channel: true, assigneeId: true, externalUrl: true },
        },
      },
    });
    return toPaginated(rows, query.limit);
  });

  app.get("/vehicles/:id", { preHandler: [app.requireOrg("vehicle:read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const vehicle = await app.prisma.vehicle.findFirst({
      where: { id, orgId: request.org!.orgId },
      include: {
        photos: { orderBy: { position: "asc" } },
        priceHistory: { orderBy: { createdAt: "desc" }, take: 50 },
        listings: {
          orderBy: { createdAt: "desc" },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            events: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        },
        source: { select: { id: true, name: true, type: true } },
      },
    });
    if (!vehicle) throw AppError.notFound("Vehicle not found");
    return { vehicle };
  });

  app.post("/vehicles", { preHandler: [app.requireOrg("vehicle:create")] }, async (request, reply) => {
    const input = createVehicleSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const sourceId = await manualSourceId(app, orgId);
    const stats = await applyImportItems(app.prisma, [{ ...input, externalId: null }], {
      orgId,
      sourceId,
      actor: { type: "USER", userId: request.auth!.userId },
      maxPhotos: app.config.IMPORT_MAX_PHOTOS,
      hub: notificationHub,
    });
    if (stats.created === 0 && stats.updated === 0) {
      throw AppError.validation(stats.errors[0]?.message ?? "Vehicle could not be saved", stats);
    }
    // Normalization may drop an invalid VIN — look up by whichever key survived.
    const vehicle = await app.prisma.vehicle.findFirst({
      where: {
        orgId,
        OR: [
          ...(input.vin ? [{ vin: input.vin.toUpperCase() }] : []),
          ...(input.stockNumber ? [{ stockNumber: input.stockNumber }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: "USER",
      actorUserId: request.auth!.userId,
      action: stats.created > 0 ? "VEHICLE_CREATED" : "VEHICLE_UPDATED",
      entityType: "Vehicle",
      entityId: vehicle?.id,
      ip: request.ip,
    });
    return reply.status(stats.created > 0 ? 201 : 200).send({ vehicle, stats });
  });

  app.patch("/vehicles/:id", { preHandler: [app.requireOrg("vehicle:update")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = updateVehicleSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const existing = await app.prisma.vehicle.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Vehicle not found");

    if (input.vin && input.vin.toUpperCase() !== existing.vin) {
      const conflict = await app.prisma.vehicle.findUnique({
        where: { orgId_vin: { orgId, vin: input.vin.toUpperCase() } },
      });
      if (conflict) throw AppError.conflict("Another vehicle already uses this VIN");
    }

    const priceChanged = input.priceCents != null && input.priceCents !== existing.priceCents;
    const { photoUrls, ...fields } = input;
    const vehicle = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id },
        data: {
          ...fields,
          vin: fields.vin ? fields.vin.toUpperCase() : undefined,
          ...(priceChanged ? { status: "PRICE_CHANGED" as const } : {}),
          lastSeenAt: new Date(),
        },
      });
      if (priceChanged) {
        await tx.priceHistory.create({
          data: {
            vehicleId: id,
            priceCents: input.priceCents!,
            source: "MANUAL",
            changedById: request.auth!.userId,
          },
        });
      }
      if (photoUrls) {
        await tx.vehiclePhoto.deleteMany({ where: { vehicleId: id } });
        await tx.vehiclePhoto.createMany({
          data: photoUrls.map((url, position) => ({ vehicleId: id, url, position })),
          skipDuplicates: true,
        });
      }
      return updated;
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: "USER",
      actorUserId: request.auth!.userId,
      action: "VEHICLE_UPDATED",
      entityType: "Vehicle",
      entityId: id,
      meta: { changedKeys: Object.keys(input) },
      ip: request.ip,
    });
    return { vehicle };
  });

  app.post("/vehicles/:id/archive", { preHandler: [app.requireOrg("vehicle:archive")] }, async (request) => {
    const { id } = request.params as { id: string };
    const orgId = request.org!.orgId;
    const existing = await app.prisma.vehicle.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Vehicle not found");
    const vehicle = await app.prisma.vehicle.update({ where: { id }, data: { status: "ARCHIVED" } });
    await writeAudit(app.prisma, {
      orgId,
      actorType: "USER",
      actorUserId: request.auth!.userId,
      action: "VEHICLE_ARCHIVED",
      entityType: "Vehicle",
      entityId: id,
      ip: request.ip,
    });
    return { vehicle };
  });

  app.post("/vehicles/:id/mark-sold", { preHandler: [app.requireOrg("vehicle:mark-sold")] }, async (request) => {
    const { id } = request.params as { id: string };
    await markVehicleSold(app.prisma, notificationHub, {
      orgId: request.org!.orgId,
      vehicleId: id,
      actor: { type: "USER", userId: request.auth!.userId, ip: request.ip },
    });
    const vehicle = await app.prisma.vehicle.findUnique({ where: { id } });
    return { vehicle };
  });

  app.post("/vehicles/bulk", { preHandler: [app.requireOrg("vehicle:read")] }, async (request) => {
    const input = bulkVehicleActionSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const role = request.org!.role;
    const isAdmin = request.auth!.isPlatformAdmin;

    const required = {
      "generate-descriptions": "description:generate",
      "queue-listings": "listing:create",
      "mark-sold": "vehicle:mark-sold",
      archive: "vehicle:archive",
    } as const;
    const perm = required[input.action];
    if (!hasPermission(role, perm, isAdmin)) throw AppError.forbidden(`Missing permission: ${perm}`);

    const results: { vehicleId: string; ok: boolean; message?: string; listingId?: string }[] = [];
    for (const vehicleId of input.vehicleIds) {
      try {
        if (input.action === "generate-descriptions") {
          await app.jobQueue.enqueue("GENERATE_DESCRIPTION", {
            orgId,
            vehicleId,
            userId: request.auth!.userId,
          });
          results.push({ vehicleId, ok: true, message: "queued" });
        } else if (input.action === "queue-listings") {
          const listing = await createListing(app.prisma, notificationHub, {
            orgId,
            actor: { type: "USER", userId: request.auth!.userId, ip: request.ip },
            input: {
              vehicleId,
              channel: input.channel,
              assigneeId: input.assigneeId ?? request.auth!.userId,
            },
          });
          const transitioned = await transitionListing(app.prisma, notificationHub, {
            orgId,
            listingId: listing.id,
            actor: { type: "USER", userId: request.auth!.userId, ip: request.ip },
            input: { to: "QUEUED", note: "Bulk queue" },
            canTransitionAll: true,
          });
          results.push({ vehicleId, ok: true, listingId: transitioned.listing.id });
        } else if (input.action === "mark-sold") {
          await markVehicleSold(app.prisma, notificationHub, {
            orgId,
            vehicleId,
            actor: { type: "USER", userId: request.auth!.userId, ip: request.ip },
          });
          results.push({ vehicleId, ok: true });
        } else {
          await app.prisma.vehicle.updateMany({
            where: { id: vehicleId, orgId },
            data: { status: "ARCHIVED" },
          });
          results.push({ vehicleId, ok: true });
        }
      } catch (err) {
        results.push({ vehicleId, ok: false, message: err instanceof Error ? err.message : "failed" });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { results, succeeded, failed: results.length - succeeded };
  });
}
