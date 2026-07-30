import type { Prisma, PrismaClient, Vehicle } from "@okauto/db";
import { jsonFeedItemSchema } from "@okauto/shared";
import type { z } from "zod";
import { normalizeFeedItem, type NormalizedVehicle } from "./normalize.js";

/** Pre-parse feed item shape (schema defaults not yet applied). */
export type FeedItemInput = z.input<typeof jsonFeedItemSchema>;
import { formatMoney, listingStakeholders, notify, notifyUserOrLeaders } from "../modules/notifications/service.js";
import type { NotificationHub } from "../modules/notifications/hub.js";

export interface ImportStats {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  errors: { index: number; message: string }[];
  warnings: { index: number; messages: string[] }[];
}

export interface ApplyImportOptions {
  orgId: string;
  sourceId: string;
  actor: { type: "SYSTEM" | "USER" | "WEBHOOK"; userId?: string | null };
  maxPhotos: number;
  hub?: NotificationHub | null;
}

const TRACKED_FIELDS: (keyof NormalizedVehicle)[] = [
  "year",
  "make",
  "model",
  "trim",
  "bodyStyle",
  "fuelType",
  "transmission",
  "drivetrain",
  "mileage",
  "exteriorColor",
  "interiorColor",
  "description",
];

function vehicleChanged(existing: Vehicle, next: NormalizedVehicle): boolean {
  if (existing.priceCents !== next.priceCents) return true;
  for (const field of TRACKED_FIELDS) {
    const a = existing[field as keyof Vehicle];
    const b = next[field];
    if (a !== b && !(a == null && b == null)) return true;
  }
  return false;
}

async function replacePhotos(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  photoUrls: string[],
): Promise<void> {
  await tx.vehiclePhoto.deleteMany({ where: { vehicleId } });
  if (photoUrls.length > 0) {
    await tx.vehiclePhoto.createMany({
      data: photoUrls.map((url, position) => ({ vehicleId, url, position })),
      skipDuplicates: true,
    });
  }
}

async function alertPriceChange(
  db: PrismaClient,
  hub: NotificationHub | null | undefined,
  vehicle: Vehicle,
  fromCents: number,
  toCents: number,
): Promise<void> {
  const { userIds } = await listingStakeholders(db, vehicle.id);
  const title = `Price change: ${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ").trim();
  const body = `Feed price updated from ${formatMoney(fromCents, vehicle.currency)} to ${formatMoney(toCents, vehicle.currency)}.`;
  if (userIds.length === 0) {
    await notifyUserOrLeaders(db, hub ?? null, { orgId: vehicle.orgId, type: "PRICE_CHANGED", title, body });
    return;
  }
  for (const userId of userIds) {
    await notify(db, hub ?? null, { orgId: vehicle.orgId, userId, type: "PRICE_CHANGED", title, body });
  }
}

/**
 * Applies a batch of raw feed items to an org's inventory with normalization,
 * VIN/stock dedupe, price history, and change detection. Each row is applied in
 * its own transaction so one bad row never blocks the batch.
 */
export async function applyImportItems(
  db: PrismaClient,
  items: FeedItemInput[],
  options: ApplyImportOptions,
): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, unchanged: 0, failed: 0, errors: [], warnings: [] };

  for (const [index, raw] of items.entries()) {
    const normalized = normalizeFeedItem(raw, options.maxPhotos);
    if (!normalized.ok) {
      stats.failed += 1;
      stats.errors.push({ index, message: normalized.error });
      continue;
    }
    const next = normalized.vehicle;
    if (next.warnings.length > 0) stats.warnings.push({ index, messages: next.warnings });

    try {
      const outcome = await db.$transaction(async (tx) => {
        const existing = next.vin
          ? await tx.vehicle.findUnique({ where: { orgId_vin: { orgId: options.orgId, vin: next.vin } } })
          : next.stockNumber
            ? await tx.vehicle.findUnique({
                where: { orgId_stockNumber: { orgId: options.orgId, stockNumber: next.stockNumber } },
              })
            : null;

        if (!existing) {
          const created = await tx.vehicle.create({
            data: {
              orgId: options.orgId,
              sourceId: options.sourceId,
              createdById: options.actor.userId ?? null,
              vin: next.vin,
              stockNumber: next.stockNumber,
              externalId: next.externalId,
              year: next.year,
              make: next.make,
              model: next.model,
              trim: next.trim,
              bodyStyle: next.bodyStyle,
              fuelType: next.fuelType,
              transmission: next.transmission,
              drivetrain: next.drivetrain,
              mileage: next.mileage,
              priceCents: next.priceCents,
              currency: next.currency,
              condition: next.condition,
              exteriorColor: next.exteriorColor,
              interiorColor: next.interiorColor,
              description: next.description,
              status: "ACTIVE",
              lastSeenAt: new Date(),
              rawPayload: raw as unknown as Prisma.InputJsonValue,
              priceHistory: {
                create: { priceCents: next.priceCents, source: options.actor.type === "USER" ? "MANUAL" : "SYNC" },
              },
            },
          });
          await replacePhotos(tx, created.id, next.photoUrls);
          return "created" as const;
        }

        const changed = vehicleChanged(existing, next);
        const priceChanged = existing.priceCents !== next.priceCents;

        await tx.vehicle.update({
          where: { id: existing.id },
          data: {
            vin: next.vin ?? existing.vin,
            stockNumber: next.stockNumber ?? existing.stockNumber,
            externalId: next.externalId ?? existing.externalId,
            year: next.year,
            make: next.make,
            model: next.model,
            trim: next.trim,
            bodyStyle: next.bodyStyle,
            fuelType: next.fuelType,
            transmission: next.transmission,
            drivetrain: next.drivetrain,
            mileage: next.mileage,
            exteriorColor: next.exteriorColor,
            interiorColor: next.interiorColor,
            description: next.description ?? existing.description,
            priceCents: next.priceCents,
            currency: next.currency,
            condition: next.condition,
            lastSeenAt: new Date(),
            status:
              existing.status === "SOLD" || existing.status === "ARCHIVED"
                ? existing.status
                : priceChanged
                  ? "PRICE_CHANGED"
                  : existing.status === "SUSPECTED_SOLD"
                    ? "ACTIVE"
                    : existing.status,
            rawPayload: raw as unknown as Prisma.InputJsonValue,
          },
        });
        if (priceChanged) {
          await tx.priceHistory.create({
            data: {
              vehicleId: existing.id,
              priceCents: next.priceCents,
              source: options.actor.type === "USER" ? "MANUAL" : "SYNC",
              changedById: options.actor.userId ?? null,
            },
          });
        }
        if (changed || next.photoUrls.length > 0) await replacePhotos(tx, existing.id, next.photoUrls);
        if (priceChanged) return { kind: "price-changed" as const, existing };
        return changed ? ("updated" as const) : ("unchanged" as const);
      });

      if (outcome === "created") stats.created += 1;
      else if (outcome === "updated") stats.updated += 1;
      else if (outcome === "unchanged") stats.unchanged += 1;
      else if (typeof outcome === "object" && outcome.kind === "price-changed") {
        stats.updated += 1;
        await alertPriceChange(db, options.hub, outcome.existing, outcome.existing.priceCents, next.priceCents);
      }
    } catch (err) {
      stats.failed += 1;
      stats.errors.push({ index, message: err instanceof Error ? err.message : "unknown error" });
    }
  }

  return stats;
}
