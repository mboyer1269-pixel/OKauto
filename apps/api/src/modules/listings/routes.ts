import type { FastifyInstance } from "fastify";
import {
  AppError,
  createListingSchema,
  hasPermission,
  listingQuerySchema,
  listingTransitionSchema,
  updateListingSchema,
} from "@okauto/shared";
import type { Prisma } from "@okauto/db";
import { cursorWhere, toPaginated } from "../../lib/pagination.js";
import { createListing, transitionListing } from "./service.js";
import { notificationHub } from "../notifications/hub.js";
import { writeAudit } from "../../lib/audit.js";

function scopeToOwn(request: { org: { role: string } | null; auth: { userId: string; isPlatformAdmin: boolean } | null }): boolean {
  return !hasPermission(request.org?.role as never, "listing:read-all", request.auth?.isPlatformAdmin ?? false);
}

export default async function listingRoutes(app: FastifyInstance) {
  app.get("/listings", { preHandler: [app.requireOrg("listing:read")] }, async (request) => {
    const query = listingQuerySchema.parse(request.query);
    const orgId = request.org!.orgId;
    const ownOnly = scopeToOwn(request);

    const where: Prisma.ListingWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(ownOnly
        ? { OR: [{ assigneeId: request.auth!.userId }, { createdById: request.auth!.userId }] }
        : query.assigneeId
          ? { assigneeId: query.assigneeId }
          : {}),
      ...cursorWhere(query.cursor),
    };

    const rows = await app.prisma.listing.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: {
        vehicle: {
          select: {
            id: true, vin: true, stockNumber: true, year: true, make: true, model: true, trim: true,
            status: true, priceCents: true,
            photos: { orderBy: { position: "asc" }, take: 1 },
          },
        },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
    return toPaginated(rows, query.limit);
  });

  app.get("/listings/queue/mine", { preHandler: [app.requireOrg("listing:read")] }, async (request) => {
    const listings = await app.prisma.listing.findMany({
      where: {
        orgId: request.org!.orgId,
        assigneeId: request.auth!.userId,
        status: { in: ["QUEUED", "ASSIGNED"] },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 100,
      include: {
        vehicle: {
          include: { photos: { orderBy: { position: "asc" } } },
        },
      },
    });
    return { items: listings };
  });

  app.get("/listings/:id", { preHandler: [app.requireOrg("listing:read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const listing = await app.prisma.listing.findFirst({
      where: { id, orgId: request.org!.orgId },
      include: {
        vehicle: { include: { photos: { orderBy: { position: "asc" } } } },
        assignee: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!listing) throw AppError.notFound("Listing not found");
    if (
      scopeToOwn(request) &&
      listing.assigneeId !== request.auth!.userId &&
      listing.createdById !== request.auth!.userId
    ) {
      throw AppError.notFound("Listing not found");
    }
    return { listing };
  });

  app.get("/listings/:id/events", { preHandler: [app.requireOrg("listing:read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const listing = await app.prisma.listing.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!listing) throw AppError.notFound("Listing not found");
    const events = await app.prisma.listingEvent.findMany({
      where: { listingId: id },
      orderBy: { createdAt: "desc" },
      include: { actorUser: { select: { id: true, name: true, email: true } } },
    });
    return { events };
  });

  app.post("/listings", { preHandler: [app.requireOrg("listing:create")] }, async (request, reply) => {
    const input = createListingSchema.parse(request.body);
    const listing = await createListing(app.prisma, notificationHub, {
      orgId: request.org!.orgId,
      actor: { type: request.auth!.actorType === "EXTENSION" ? "EXTENSION" : "USER", userId: request.auth!.userId, ip: request.ip },
      input,
    });
    return reply.status(201).send({ listing });
  });

  app.patch("/listings/:id", { preHandler: [app.requireOrg("listing:update")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = updateListingSchema.parse(request.body);
    const listing = await app.prisma.listing.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!listing) throw AppError.notFound("Listing not found");
    const canAll = hasPermission(request.org!.role, "listing:transition-all", request.auth!.isPlatformAdmin);
    if (!canAll && listing.assigneeId !== request.auth!.userId && listing.createdById !== request.auth!.userId) {
      throw AppError.forbidden("You can only edit listings assigned to you");
    }
    if (input.assigneeId) {
      const membership = await app.prisma.membership.findUnique({
        where: { userId_orgId: { userId: input.assigneeId, orgId: request.org!.orgId } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        throw AppError.validation("Assignee is not an active member");
      }
    }
    const updated = await app.prisma.listing.update({
      where: { id },
      data: { title: input.title, description: input.description, assigneeId: input.assigneeId },
    });
    return { listing: updated };
  });

  app.post("/listings/:id/transition", { preHandler: [app.requireOrg("listing:transition-own")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = listingTransitionSchema.parse(request.body);
    const canAll = hasPermission(request.org!.role, "listing:transition-all", request.auth!.isPlatformAdmin);
    const result = await transitionListing(app.prisma, notificationHub, {
      orgId: request.org!.orgId,
      listingId: id,
      actor: { type: request.auth!.actorType === "EXTENSION" ? "EXTENSION" : "USER", userId: request.auth!.userId, ip: request.ip },
      input,
      canTransitionAll: canAll,
    });
    return result;
  });

  app.post(
    "/listings/:id/notes",
    { preHandler: [app.requireOrg("listing:transition-own")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { note?: string };
      if (!body.note || body.note.length > 500) throw AppError.validation("note (1-500 chars) is required");
      const listing = await app.prisma.listing.findFirst({ where: { id, orgId: request.org!.orgId } });
      if (!listing) throw AppError.notFound("Listing not found");
      await app.prisma.listingEvent.create({
        data: {
          listingId: id,
          actorType: request.auth!.actorType,
          actorUserId: request.auth!.userId,
          fromStatus: listing.status,
          toStatus: listing.status,
          note: body.note,
        },
      });
      await writeAudit(app.prisma, {
        orgId: request.org!.orgId,
        actorType: request.auth!.actorType,
        actorUserId: request.auth!.userId,
        action: "LISTING_NOTE",
        entityType: "Listing",
        entityId: id,
        ip: request.ip,
      });
      return reply.status(201).send({ ok: true });
    },
  );
}
