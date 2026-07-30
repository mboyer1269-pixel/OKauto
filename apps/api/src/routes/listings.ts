import type { FastifyInstance } from "fastify";
import { prisma } from "@okauto/db";
import { ListingCreateSchema, vehicleTitle } from "@okauto/shared";
import { authenticate, requireOrgPermission } from "../plugins/auth.js";
import { writeAudit } from "../services/audit.js";

export async function listingRoutes(app: FastifyInstance) {
  app.get(
    "/v1/orgs/:orgId/listings",
    { preHandler: [authenticate, requireOrgPermission("listings:read")] },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const q = request.query as {
        status?: string;
        userId?: string;
        take?: string;
        skip?: string;
      };
      const take = Math.min(Number(q.take ?? 50), 200);
      const skip = Number(q.skip ?? 0);
      const where = {
        organizationId: orgId,
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.listing.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: {
            vehicle: true,
            user: { select: { id: true, name: true, email: true } },
            events: { orderBy: { createdAt: "desc" }, take: 5 },
          },
        }),
        prisma.listing.count({ where }),
      ]);
      return { items, total, take, skip };
    },
  );

  app.post(
    "/v1/orgs/:orgId/listings",
    { preHandler: [authenticate, requireOrgPermission("listings:write")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = ListingCreateSchema.parse(request.body);
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: body.vehicleId, organizationId: orgId },
      });
      if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

      // Duplicate prevention: one active posted listing per vehicle+channel+user
      const dup = await prisma.listing.findFirst({
        where: {
          organizationId: orgId,
          vehicleId: vehicle.id,
          userId: request.user!.id,
          channel: body.channel,
          status: { in: ["draft", "ready", "posted"] },
        },
      });
      if (dup) {
        return reply.code(409).send({
          error: "Active listing already exists for this vehicle",
          code: "DUPLICATE_LISTING",
          details: { listingId: dup.id },
        });
      }

      const title = body.title ?? vehicleTitle(vehicle);
      const description = body.description ?? vehicle.description ?? title;
      const priceCents = body.priceCents ?? vehicle.priceCents;

      const listing = await prisma.listing.create({
        data: {
          organizationId: orgId,
          vehicleId: vehicle.id,
          userId: request.user!.id,
          channel: body.channel,
          status: "ready",
          title,
          description,
          priceCents,
          groupName: body.groupName ?? null,
          payload: {
            photoUrls: vehicle.photoUrls,
            vin: vehicle.vin,
            mileage: vehicle.mileage,
            policy: {
              humanInTheLoop: true,
              captchaBypassForbidden: true,
            },
          },
        },
        include: { vehicle: true },
      });

      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          type: "created",
          meta: { channel: body.channel },
        },
      });

      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { status: vehicle.status === "sold" ? "sold" : "listed" },
      });

      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "listing.create",
        entity: "listing",
        entityId: listing.id,
      });

      return reply.code(201).send({ listing });
    },
  );

  app.patch(
    "/v1/orgs/:orgId/listings/:listingId",
    { preHandler: [authenticate, requireOrgPermission("listings:write")] },
    async (request, reply) => {
      const { orgId, listingId } = request.params as {
        orgId: string;
        listingId: string;
      };
      const body = (request.body ?? {}) as {
        status?: "draft" | "ready" | "posted" | "needs_removal" | "removed" | "failed";
        externalRef?: string;
        title?: string;
        description?: string;
        priceCents?: number;
        failureReason?: string;
      };

      const existing = await prisma.listing.findFirst({
        where: { id: listingId, organizationId: orgId },
      });
      if (!existing) return reply.code(404).send({ error: "Listing not found" });

      // Salespeople can only mutate their own listings unless manager+
      if (
        request.org!.role === "salesperson" &&
        existing.userId !== request.user!.id
      ) {
        return reply.code(403).send({ error: "Cannot modify another user's listing" });
      }

      const listing = await prisma.listing.update({
        where: { id: listingId },
        data: {
          status: body.status,
          externalRef: body.externalRef,
          title: body.title,
          description: body.description,
          priceCents: body.priceCents,
          postedAt: body.status === "posted" ? new Date() : undefined,
          removedAt:
            body.status === "removed" ? new Date() : undefined,
        },
      });

      if (body.status) {
        await prisma.listingEvent.create({
          data: {
            listingId,
            type: body.status,
            meta: {
              failureReason: body.failureReason,
              externalRef: body.externalRef,
            },
          },
        });
      }

      await writeAudit({
        organizationId: orgId,
        actorId: request.user!.id,
        action: "listing.update",
        entity: "listing",
        entityId: listingId,
        meta: body as Record<string, unknown>,
      });

      return { listing };
    },
  );

  app.get(
    "/v1/orgs/:orgId/listings/:listingId",
    { preHandler: [authenticate, requireOrgPermission("listings:read")] },
    async (request, reply) => {
      const { orgId, listingId } = request.params as {
        orgId: string;
        listingId: string;
      };
      const listing = await prisma.listing.findFirst({
        where: { id: listingId, organizationId: orgId },
        include: {
          vehicle: true,
          user: { select: { id: true, name: true, email: true } },
          events: { orderBy: { createdAt: "desc" } },
        },
      });
      if (!listing) return reply.code(404).send({ error: "Listing not found" });
      return { listing };
    },
  );
}
