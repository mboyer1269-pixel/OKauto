import {
  buildMarketplaceDraft,
  bulkVehicleActionSchema,
  generateDescriptionSchema,
  generateDescription,
  vehicleInputSchema,
  vehicleQuerySchema,
  vehicleUpdateSchema,
  validateVin,
} from "@openlot/shared";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { listings, organizations, priceHistory, vehicles } from "../db/schema.js";
import { enqueueJob } from "../jobs/queue.js";
import { writeAudit } from "../lib/audit.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { requireMembership } from "../plugins/auth.js";

export function vehicleRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  async function getVehicleOr404(orgId: string, vehicleId: string) {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.orgId, orgId), eq(vehicles.id, vehicleId)))
      .limit(1);
    if (!vehicle) throw errors.notFound("Vehicle not found");
    return vehicle;
  }

  return async (app) => {
    /** VIN validation + decoding (offline check digit + NHTSA enrichment). */
    app.post("/vin/decode", async (request) => {
      const input = parseOrThrow(z.object({ vin: z.string().min(5).max(20) }), request.body);
      return ctx.decodeVin(input.vin);
    });

    app.get("/orgs/:orgId/vehicles", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);
      const query = parseOrThrow(vehicleQuerySchema, request.query);

      const conditions: SQL[] = [eq(vehicles.orgId, orgId)];
      if (query.status) conditions.push(eq(vehicles.status, query.status));
      if (query.make) conditions.push(ilike(vehicles.make, query.make));
      if (query.minPriceCents !== undefined) conditions.push(gte(vehicles.priceCents, query.minPriceCents));
      if (query.maxPriceCents !== undefined) conditions.push(lte(vehicles.priceCents, query.maxPriceCents));
      if (query.q) {
        const term = `%${query.q}%`;
        conditions.push(
          or(
            ilike(vehicles.vin, term),
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            ilike(vehicles.stockNumber, term),
            ilike(vehicles.trim, term),
          )!,
        );
      }
      const where = and(...conditions);

      const sortColumn = {
        createdAt: vehicles.createdAt,
        updatedAt: vehicles.updatedAt,
        price: vehicles.priceCents,
        year: vehicles.year,
        mileage: vehicles.mileage,
      }[query.sort];
      const orderBy = query.dir === "asc" ? asc(sortColumn) : desc(sortColumn);

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(vehicles).where(where);
      const items = await db
        .select()
        .from(vehicles)
        .where(where)
        .orderBy(orderBy)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      // Attach active-listing counts for duplicate prevention hints in UIs.
      const ids = items.map((v) => v.id);
      const listingCounts = ids.length
        ? await db
            .select({ vehicleId: listings.vehicleId, count: sql<number>`count(*)::int` })
            .from(listings)
            .where(and(inArray(listings.vehicleId, ids), inArray(listings.status, ["PREPARED", "ACTIVE"])))
            .groupBy(listings.vehicleId)
        : [];
      const countByVehicle = new Map(listingCounts.map((r) => [r.vehicleId, Number(r.count)]));

      return {
        items: items.map((v) => ({ ...v, activeListingCount: countByVehicle.get(v.id) ?? 0 })),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(countRow?.count ?? 0),
      };
    });

    app.post("/orgs/:orgId/vehicles", async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId);
      const input = parseOrThrow(vehicleInputSchema, request.body);

      if (input.vin.length === 17) {
        const vinInfo = validateVin(input.vin);
        if (!vinInfo.valid) throw errors.unprocessable(`Invalid VIN: ${vinInfo.error}`);
      }
      const [existing] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.orgId, orgId), eq(vehicles.vin, input.vin)))
        .limit(1);
      if (existing) throw errors.conflict("A vehicle with this VIN already exists in your inventory");

      const [vehicle] = await db
        .insert(vehicles)
        .values({
          orgId,
          vin: input.vin,
          stockNumber: input.stockNumber ?? null,
          year: input.year,
          make: input.make,
          model: input.model,
          trim: input.trim ?? null,
          bodyStyle: input.bodyStyle ?? null,
          condition: input.condition,
          mileage: input.mileage ?? null,
          priceCents: input.priceCents ?? null,
          exteriorColor: input.exteriorColor ?? null,
          interiorColor: input.interiorColor ?? null,
          transmission: input.transmission ?? null,
          fuelType: input.fuelType ?? null,
          drivetrain: input.drivetrain ?? null,
          engine: input.engine ?? null,
          doors: input.doors ?? null,
          description: input.description ?? null,
          descriptionSource: input.description ? "MANUAL" : null,
          features: input.features,
          photoUrls: input.photoUrls,
          status: input.status,
          source: "MANUAL",
        })
        .returning();
      if (input.priceCents !== undefined) {
        await db.insert(priceHistory).values({ vehicleId: vehicle!.id, priceCents: input.priceCents, source: "MANUAL" });
      }
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "vehicle.create",
        entityType: "vehicle",
        entityId: vehicle!.id,
        meta: { vin: input.vin },
        ip: request.ip,
      });
      return reply.status(201).send({ vehicle: vehicle! });
    });

    app.get("/orgs/:orgId/vehicles/:vehicleId", async (request) => {
      const { orgId, vehicleId } = request.params as { orgId: string; vehicleId: string };
      await requireMembership(db, request, orgId);
      const vehicle = await getVehicleOr404(orgId, vehicleId);
      const history = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.vehicleId, vehicleId))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(50);
      const vehicleListings = await db
        .select()
        .from(listings)
        .where(eq(listings.vehicleId, vehicleId))
        .orderBy(desc(listings.createdAt));
      return { vehicle, priceHistory: history, listings: vehicleListings };
    });

    app.patch("/orgs/:orgId/vehicles/:vehicleId", async (request) => {
      const { orgId, vehicleId } = request.params as { orgId: string; vehicleId: string };
      const membership = await requireMembership(db, request, orgId);
      const vehicle = await getVehicleOr404(orgId, vehicleId);
      const input = parseOrThrow(vehicleUpdateSchema, request.body);

      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        if (key === "vin") continue; // VIN is immutable once created
        patch[key] = value;
      }
      if (input.description !== undefined) patch.descriptionSource = "MANUAL";
      if (Object.keys(patch).length === 0) return { vehicle };

      if (input.priceCents !== undefined && input.priceCents !== vehicle.priceCents) {
        await db.insert(priceHistory).values({ vehicleId, priceCents: input.priceCents, source: "MANUAL" });
      }
      if (input.status === "SOLD" && vehicle.status !== "SOLD") {
        patch.soldDetectedAt = new Date();
        await enqueueJob(db, "sold_alerts", { orgId, vehicleIds: [vehicleId] });
      }
      patch.updatedAt = new Date();
      const [updated] = await db.update(vehicles).set(patch).where(eq(vehicles.id, vehicleId)).returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "vehicle.update",
        entityType: "vehicle",
        entityId: vehicleId,
        meta: { fields: Object.keys(patch) },
        ip: request.ip,
      });
      return { vehicle: updated! };
    });

    app.delete("/orgs/:orgId/vehicles/:vehicleId", async (request) => {
      const { orgId, vehicleId } = request.params as { orgId: string; vehicleId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      await getVehicleOr404(orgId, vehicleId);
      // Soft delete: archive rather than destroy (audit & listing history remain).
      await db
        .update(vehicles)
        .set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(eq(vehicles.id, vehicleId));
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "vehicle.archive",
        entityType: "vehicle",
        entityId: vehicleId,
        ip: request.ip,
      });
      return { ok: true };
    });

    /** Bulk operations for the dashboard (mark sold/available, archive, AI descriptions). */
    app.post("/orgs/:orgId/vehicles/bulk", async (request) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(bulkVehicleActionSchema, request.body);
      const owned = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.orgId, orgId), inArray(vehicles.id, input.vehicleIds)));
      const ids = owned.map((v) => v.id);
      if (ids.length === 0) throw errors.notFound("No matching vehicles");

      let affected = 0;
      switch (input.action) {
        case "MARK_SOLD": {
          await db
            .update(vehicles)
            .set({ status: "SOLD", soldDetectedAt: new Date(), updatedAt: new Date() })
            .where(inArray(vehicles.id, ids));
          await enqueueJob(db, "sold_alerts", { orgId, vehicleIds: ids });
          affected = ids.length;
          break;
        }
        case "MARK_AVAILABLE": {
          await db
            .update(vehicles)
            .set({ status: "AVAILABLE", soldDetectedAt: null, updatedAt: new Date() })
            .where(inArray(vehicles.id, ids));
          affected = ids.length;
          break;
        }
        case "ARCHIVE": {
          await db.update(vehicles).set({ status: "ARCHIVED", updatedAt: new Date() }).where(inArray(vehicles.id, ids));
          affected = ids.length;
          break;
        }
        case "GENERATE_DESCRIPTIONS": {
          for (const id of ids) {
            await enqueueJob(db, "generate_description", { vehicleId: id }, { dedupeKey: `gen_desc:${id}` });
          }
          affected = ids.length;
          break;
        }
      }
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: `vehicle.bulk.${input.action.toLowerCase()}`,
        entityType: "vehicle",
        meta: { count: affected, vehicleIds: ids },
        ip: request.ip,
      });
      return { affected };
    });

    /** Synchronous AI/template description generation for one vehicle. */
    app.post("/orgs/:orgId/vehicles/:vehicleId/generate-description", async (request) => {
      const { orgId, vehicleId } = request.params as { orgId: string; vehicleId: string };
      const membership = await requireMembership(db, request, orgId);
      const vehicle = await getVehicleOr404(orgId, vehicleId);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      const settings = (org?.settings ?? {}) as {
        descriptionTone?: "PROFESSIONAL" | "FRIENDLY" | "ENTHUSIASTIC";
        includeDisclaimer?: boolean;
      };
      const input = parseOrThrow(generateDescriptionSchema, {
        ...(request.body && typeof request.body === "object" ? request.body : {}),
      });
      const result = await ctx.ai.generateVehicleDescription(
        {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          bodyStyle: vehicle.bodyStyle as never,
          condition: vehicle.condition as never,
          mileage: vehicle.mileage,
          priceCents: vehicle.priceCents,
          exteriorColor: vehicle.exteriorColor,
          interiorColor: vehicle.interiorColor,
          transmission: vehicle.transmission as never,
          fuelType: vehicle.fuelType as never,
          drivetrain: vehicle.drivetrain as never,
          engine: vehicle.engine,
          doors: vehicle.doors,
          features: (vehicle.features as string[]) ?? [],
          dealershipName: org?.name,
          dealershipPhone: org?.phone,
          dealershipCity: org?.city,
        },
        {
          tone: input.tone ?? settings.descriptionTone ?? "PROFESSIONAL",
          includeDisclaimer: input.includeDisclaimer ?? settings.includeDisclaimer ?? true,
          maxLength: input.maxLength,
        },
      );
      const [updated] = await db
        .update(vehicles)
        .set({ description: result.text, descriptionSource: result.source, updatedAt: new Date() })
        .where(eq(vehicles.id, vehicleId))
        .returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "vehicle.generate_description",
        entityType: "vehicle",
        entityId: vehicleId,
        meta: { source: result.source },
        ip: request.ip,
      });
      return { vehicle: updated!, source: result.source };
    });

    /** Field payload the extension fills into the Marketplace form. */
    app.get("/orgs/:orgId/vehicles/:vehicleId/marketplace-draft", async (request) => {
      const { orgId, vehicleId } = request.params as { orgId: string; vehicleId: string };
      await requireMembership(db, request, orgId);
      const vehicle = await getVehicleOr404(orgId, vehicleId);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      const fallback = generateDescription({
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        bodyStyle: vehicle.bodyStyle as never,
        condition: vehicle.condition as never,
        mileage: vehicle.mileage,
        priceCents: vehicle.priceCents,
        exteriorColor: vehicle.exteriorColor,
        interiorColor: vehicle.interiorColor,
        transmission: vehicle.transmission as never,
        fuelType: vehicle.fuelType as never,
        drivetrain: vehicle.drivetrain as never,
        engine: vehicle.engine,
        doors: vehicle.doors,
        features: (vehicle.features as string[]) ?? [],
        dealershipName: org?.name,
        dealershipPhone: org?.phone,
        dealershipCity: org?.city,
      });
      const draft = buildMarketplaceDraft(
        {
          id: vehicle.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          bodyStyle: vehicle.bodyStyle as never,
          condition: vehicle.condition as never,
          mileage: vehicle.mileage,
          priceCents: vehicle.priceCents,
          exteriorColor: vehicle.exteriorColor,
          interiorColor: vehicle.interiorColor,
          transmission: vehicle.transmission as never,
          fuelType: vehicle.fuelType as never,
          description: vehicle.description,
          photoUrls: (vehicle.photoUrls as string[]) ?? [],
        },
        fallback,
      );
      return { draft };
    });
  };
}
