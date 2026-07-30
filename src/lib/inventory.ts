import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  inventorySources,
  listings,
  notifications,
  outboxEvents,
  syncRuns,
  vehicleChanges,
  vehicleMedia,
  vehicles,
} from "@/db/schema";
import { ApiError } from "@/lib/http";
import { vehicleInput } from "@/lib/vehicle";

export const importPayload = z.object({
  sourceId: z.uuid(),
  completeSnapshot: z.boolean().default(false),
  vehicles: z.array(vehicleInput).min(1).max(5_000),
});

export type ImportPayload = z.infer<typeof importPayload>;

export async function importInventory(organizationId: string, payload: ImportPayload): Promise<Record<string, number>> {
  const source = await db()
    .select({ id: inventorySources.id })
    .from(inventorySources)
    .where(and(eq(inventorySources.id, payload.sourceId), eq(inventorySources.organizationId, organizationId)))
    .limit(1);
  if (!source[0]) throw new ApiError(404, "SOURCE_NOT_FOUND", "Inventory source was not found.");

  const [run] = await db().insert(syncRuns).values({ sourceId: payload.sourceId }).returning({ id: syncRuns.id });
  if (!run) throw new ApiError(500, "SYNC_START_FAILED", "Could not start an inventory sync.");

  const counts = { created: 0, updated: 0, priceChanged: 0, sold: 0, stale: 0, unchanged: 0 };
  const seenIds: string[] = [];
  try {
    for (const input of payload.vehicles) {
      await db().transaction(async (tx) => {
        const identity = input.vin
          ? eq(vehicles.vin, input.vin)
          : eq(vehicles.stockNumber, input.stockNumber!);
        const [existing] = await tx
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.organizationId, organizationId), identity))
          .limit(1);

        const values = {
          organizationId,
          sourceId: payload.sourceId,
          vin: input.vin,
          stockNumber: input.stockNumber,
          year: input.year,
          make: input.make,
          model: input.model,
          trim: input.trim,
          mileage: input.mileage,
          priceCents: input.priceCents,
          status: input.status,
          exteriorColor: input.exteriorColor,
          transmission: input.transmission,
          fuelType: input.fuelType,
          bodyStyle: input.bodyStyle,
          facts: input.facts,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          soldAt: input.status === "SOLD" ? (existing?.soldAt ?? new Date()) : null,
        } as const;

        let vehicleId: string;
        if (existing) {
          vehicleId = existing.id;
          const priceChanged = existing.priceCents !== input.priceCents;
          const becameSold = existing.status !== "SOLD" && input.status === "SOLD";
          const materiallyChanged =
            priceChanged ||
            becameSold ||
            existing.mileage !== input.mileage ||
            existing.status !== input.status ||
            existing.trim !== input.trim;
          await tx.update(vehicles).set(values).where(eq(vehicles.id, existing.id));
          if (priceChanged) {
            counts.priceChanged += 1;
            await tx.insert(vehicleChanges).values({
              vehicleId,
              type: "PRICE_CHANGED",
              before: { priceCents: existing.priceCents },
              after: { priceCents: input.priceCents },
            });
            await tx.insert(notifications).values({
              organizationId,
              type: "PRICE_CHANGED",
              title: `${input.year} ${input.make} ${input.model} price changed`,
              body: `Price changed from $${(existing.priceCents / 100).toLocaleString()} to $${(input.priceCents / 100).toLocaleString()}.`,
              entityType: "vehicle",
              entityId: vehicleId,
            });
          }
          if (becameSold) {
            counts.sold += 1;
            await handleSold(tx, organizationId, vehicleId, `${input.year} ${input.make} ${input.model}`);
          }
          if (materiallyChanged) counts.updated += 1;
          else counts.unchanged += 1;
        } else {
          const [created] = await tx.insert(vehicles).values(values).returning({ id: vehicles.id });
          if (!created) throw new ApiError(500, "VEHICLE_CREATE_FAILED", "Could not create a vehicle.");
          vehicleId = created.id;
          counts.created += 1;
        }
        seenIds.push(vehicleId);

        await tx.delete(vehicleMedia).where(eq(vehicleMedia.vehicleId, vehicleId));
        if (input.photos.length) {
          await tx.insert(vehicleMedia).values(input.photos.map((url, position) => ({ vehicleId, url, position })));
        }
      });
    }

    if (payload.completeSnapshot) {
      const snapshotConditions = [
        eq(vehicles.organizationId, organizationId),
        eq(vehicles.sourceId, payload.sourceId),
        eq(vehicles.status, "AVAILABLE"),
      ];
      if (seenIds.length) snapshotConditions.push(notInArray(vehicles.id, seenIds));
      const candidates = await db()
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(...snapshotConditions));
      if (candidates.length) {
        const missing = candidates.map((vehicle) => vehicle.id);
        await db().update(vehicles).set({ status: "STALE", updatedAt: new Date() }).where(inArray(vehicles.id, missing));
        counts.stale += missing.length;
      }
    }

    await db()
      .update(syncRuns)
      .set({ status: "SUCCEEDED", finishedAt: new Date(), counts })
      .where(eq(syncRuns.id, run.id));
    await db()
      .update(inventorySources)
      .set({ status: "HEALTHY", lastSuccessAt: new Date(), updatedAt: new Date() })
      .where(eq(inventorySources.id, payload.sourceId));
    return counts;
  } catch (error) {
    await db().update(syncRuns).set({ status: "FAILED", finishedAt: new Date(), counts, error: "Import failed; inspect structured logs." }).where(eq(syncRuns.id, run.id));
    await db().update(inventorySources).set({ status: "FAILING", updatedAt: new Date() }).where(eq(inventorySources.id, payload.sourceId));
    throw error;
  }
}

async function handleSold(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  organizationId: string,
  vehicleId: string,
  label: string,
): Promise<void> {
  const active = await tx
    .select({ id: listings.id, assigneeId: listings.assigneeId })
    .from(listings)
    .where(and(eq(listings.vehicleId, vehicleId), inArray(listings.status, ["DRAFT", "PREPARED", "PUBLISHED"])));
  if (active.length) {
    await tx
      .update(listings)
      .set({ status: "REMOVAL_REQUIRED", updatedAt: new Date() })
      .where(inArray(listings.id, active.map((listing) => listing.id)));
  }
  await tx.insert(vehicleChanges).values({ vehicleId, type: "SOLD", before: { status: "AVAILABLE" }, after: { status: "SOLD" } });
  await tx.insert(notifications).values({
    organizationId,
    type: "SOLD",
    title: `${label} sold`,
    body: active.length ? `${active.length} listing(s) require human-confirmed removal.` : "No active external listings were recorded.",
    entityType: "vehicle",
    entityId: vehicleId,
  });
  await tx.insert(outboxEvents).values({
    organizationId,
    topic: "vehicle.sold",
    payload: { vehicleId, listingIds: active.map((listing) => listing.id) },
    idempotencyKey: `vehicle.sold:${vehicleId}`,
  }).onConflictDoNothing();
}
