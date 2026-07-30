import { createListingSchema, listingEventSchema } from "@openlot/shared";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { listingEvents, listings, users, vehicles } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { requireMembership } from "../plugins/auth.js";

const listingQuerySchema = z.object({
  mine: z.coerce.boolean().default(false),
  status: z.enum(["DRAFT", "PREPARED", "ACTIVE", "ENDED", "REMOVED", "FAILED"]).optional(),
  vehicleId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Listing lifecycle transitions driven by recorded events. */
const EVENT_TRANSITIONS: Record<string, { status?: string; setPrepared?: boolean; setPublished?: boolean; setEnded?: boolean }> = {
  PREPARED: { status: "PREPARED", setPrepared: true },
  PUBLISHED: { status: "ACTIVE", setPublished: true },
  RENEWED: { status: "ACTIVE", setPublished: true },
  PRICE_UPDATED: {},
  MARKED_SOLD: { status: "ENDED", setEnded: true },
  REMOVED: { status: "REMOVED", setEnded: true },
  FAILED: { status: "FAILED" },
  NOTE: {},
};

export function listingRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    /**
     * Create a listing intent (draft) for a vehicle. Duplicate prevention:
     * a user may only have one live (draft/prepared/active) listing per vehicle.
     */
    app.post("/orgs/:orgId/listings", async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId);
      const input = parseOrThrow(createListingSchema, request.body);

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.orgId, orgId), eq(vehicles.id, input.vehicleId)))
        .limit(1);
      if (!vehicle) throw errors.notFound("Vehicle not found");
      if (vehicle.status !== "AVAILABLE" && vehicle.status !== "PENDING") {
        throw errors.conflict(`Vehicle is ${vehicle.status.toLowerCase()} and cannot be listed`);
      }

      const [duplicate] = await db
        .select({ id: listings.id, status: listings.status })
        .from(listings)
        .where(
          and(
            eq(listings.orgId, orgId),
            eq(listings.vehicleId, input.vehicleId),
            eq(listings.userId, membership.user.sub),
            inArray(listings.status, ["DRAFT", "PREPARED", "ACTIVE"]),
          ),
        )
        .limit(1);
      if (duplicate) {
        throw errors.conflict("You already have a live listing for this vehicle", { listingId: duplicate.id });
      }

      const [listing] = await db
        .insert(listings)
        .values({
          orgId,
          vehicleId: input.vehicleId,
          userId: membership.user.sub,
          channel: input.channel,
          status: "DRAFT",
        })
        .returning();
      await db.insert(listingEvents).values({
        listingId: listing!.id,
        actorUserId: membership.user.sub,
        type: "NOTE",
        message: "Listing draft created",
      });
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "listing.create",
        entityType: "listing",
        entityId: listing!.id,
        meta: { vehicleId: input.vehicleId },
        ip: request.ip,
      });
      return reply.status(201).send({ listing: listing! });
    });

    app.get("/orgs/:orgId/listings", async (request) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId);
      const query = parseOrThrow(listingQuerySchema, request.query);

      const conditions: SQL[] = [eq(listings.orgId, orgId)];
      if (query.mine) conditions.push(eq(listings.userId, membership.user.sub));
      if (query.status) conditions.push(eq(listings.status, query.status));
      if (query.vehicleId) conditions.push(eq(listings.vehicleId, query.vehicleId));
      if (query.userId) {
        // Salespeople may only inspect their own listings in detail.
        if (membership.role === "SALESPERSON" && query.userId !== membership.user.sub) {
          throw errors.forbidden("Salespeople can only view their own listings");
        }
        conditions.push(eq(listings.userId, query.userId));
      }
      const where = and(...conditions);

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(where);
      const items = await db
        .select({
          listing: listings,
          vehicle: {
            id: vehicles.id,
            vin: vehicles.vin,
            year: vehicles.year,
            make: vehicles.make,
            model: vehicles.model,
            trim: vehicles.trim,
            priceCents: vehicles.priceCents,
            status: vehicles.status,
            photoUrls: vehicles.photoUrls,
          },
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(listings)
        .innerJoin(vehicles, eq(listings.vehicleId, vehicles.id))
        .innerJoin(users, eq(listings.userId, users.id))
        .where(where)
        .orderBy(desc(listings.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return { items, page: query.page, pageSize: query.pageSize, total: Number(countRow?.count ?? 0) };
    });

    app.get("/orgs/:orgId/listings/:listingId", async (request) => {
      const { orgId, listingId } = request.params as { orgId: string; listingId: string };
      await requireMembership(db, request, orgId);
      const [listing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.orgId, orgId), eq(listings.id, listingId)))
        .limit(1);
      if (!listing) throw errors.notFound("Listing not found");
      const events = await db
        .select()
        .from(listingEvents)
        .where(eq(listingEvents.listingId, listingId))
        .orderBy(desc(listingEvents.createdAt));
      return { listing, events };
    });

    /** Record a lifecycle event (from the extension or dashboard). */
    app.post("/orgs/:orgId/listings/:listingId/events", async (request, reply) => {
      const { orgId, listingId } = request.params as { orgId: string; listingId: string };
      const membership = await requireMembership(db, request, orgId);
      const input = parseOrThrow(listingEventSchema, request.body);

      const [listing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.orgId, orgId), eq(listings.id, listingId)))
        .limit(1);
      if (!listing) throw errors.notFound("Listing not found");
      if (listing.userId !== membership.user.sub && membership.role === "SALESPERSON") {
        throw errors.forbidden("You can only update your own listings");
      }

      const transition = EVENT_TRANSITIONS[input.type] ?? {};
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (transition.status) patch.status = transition.status;
      if (transition.setPrepared) patch.preparedAt = new Date();
      if (transition.setPublished) patch.publishedAt = new Date();
      if (transition.setEnded) patch.endedAt = new Date();
      if (input.remoteUrl) patch.remoteUrl = input.remoteUrl;
      await db.update(listings).set(patch).where(eq(listings.id, listingId));

      const [event] = await db
        .insert(listingEvents)
        .values({
          listingId,
          actorUserId: membership.user.sub,
          type: input.type,
          message: input.message ?? null,
          meta: input.remoteUrl ? { remoteUrl: input.remoteUrl } : {},
        })
        .returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: `listing.event.${input.type.toLowerCase()}`,
        entityType: "listing",
        entityId: listingId,
        ip: request.ip,
      });
      const [updated] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
      return reply.status(201).send({ listing: updated!, event: event! });
    });

    /** Cancel a draft/prepared listing that never went live. */
    app.delete("/orgs/:orgId/listings/:listingId", async (request) => {
      const { orgId, listingId } = request.params as { orgId: string; listingId: string };
      const membership = await requireMembership(db, request, orgId);
      const [listing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.orgId, orgId), eq(listings.id, listingId)))
        .limit(1);
      if (!listing) throw errors.notFound("Listing not found");
      if (listing.userId !== membership.user.sub && membership.role === "SALESPERSON") {
        throw errors.forbidden("You can only cancel your own listings");
      }
      if (listing.status === "ACTIVE") {
        throw errors.conflict("Active listings must be removed on Marketplace first (record a REMOVED event)");
      }
      await db
        .update(listings)
        .set({ status: "REMOVED", endedAt: new Date(), updatedAt: new Date() })
        .where(eq(listings.id, listingId));
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "listing.cancel",
        entityType: "listing",
        entityId: listingId,
        ip: request.ip,
      });
      return { ok: true };
    });
  };
}
