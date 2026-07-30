import { parse } from "csv-parse/sync";
import {
  CsvVehicleRowSchema,
  dollarsToCents,
  normalizeVin,
} from "@okauto/shared";
import { prisma, type VehicleStatus } from "@okauto/db";

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function importVehiclesFromCsv(
  organizationId: string,
  csvText: string,
  sourceId?: string,
): Promise<ImportResult> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const parsed = CsvVehicleRowSchema.safeParse(records[i]);
    if (!parsed.success) {
      result.errors.push({
        row: rowNum,
        message: parsed.error.issues.map((x) => x.message).join("; "),
      });
      result.skipped += 1;
      continue;
    }
    const row = parsed.data;
    const vin = normalizeVin(row.vin);
    const photoUrls = (row.photoUrls ?? "")
      .split("|")
      .map((u) => u.trim())
      .filter(Boolean);

    const data = {
      stockNumber: row.stockNumber ?? null,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim ?? null,
      priceCents: dollarsToCents(row.price),
      mileage: row.mileage ?? null,
      bodyStyle: row.bodyStyle ?? null,
      exteriorColor: row.exteriorColor ?? null,
      description: row.description ?? null,
      photoUrls,
      status: (row.status ?? "available") as VehicleStatus,
      sourceId: sourceId ?? null,
      lastSyncedAt: new Date(),
    };

    try {
      if (vin) {
        const existing = await prisma.vehicle.findUnique({
          where: { organizationId_vin: { organizationId, vin } },
        });
        if (existing) {
          if (existing.priceCents !== data.priceCents) {
            await prisma.vehiclePriceHistory.create({
              data: {
                vehicleId: existing.id,
                priceCents: data.priceCents,
              },
            });
          }
          await prisma.vehicle.update({
            where: { id: existing.id },
            data: { ...data, vin },
          });
          result.updated += 1;
        } else {
          await prisma.vehicle.create({
            data: { organizationId, vin, ...data },
          });
          result.created += 1;
        }
      } else if (row.stockNumber) {
        const existing = await prisma.vehicle.findFirst({
          where: { organizationId, stockNumber: row.stockNumber },
        });
        if (existing) {
          await prisma.vehicle.update({
            where: { id: existing.id },
            data,
          });
          result.updated += 1;
        } else {
          await prisma.vehicle.create({
            data: { organizationId, vin: null, ...data },
          });
          result.created += 1;
        }
      } else {
        await prisma.vehicle.create({
          data: { organizationId, vin: null, ...data },
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Unknown import error",
      });
      result.skipped += 1;
    }
  }

  return result;
}

/** Detect sold/price changes when syncing feed payloads (JSON array). */
export async function applyFeedVehicles(
  organizationId: string,
  sourceId: string,
  items: Array<Record<string, unknown>>,
): Promise<{ created: number; updated: number; soldDetected: string[] }> {
  let created = 0;
  let updated = 0;
  const soldDetected: string[] = [];

  for (const item of items) {
    const vin = normalizeVin(String(item.vin ?? ""));
    if (!vin) continue;
    const price = Number(item.price ?? item.priceCents ?? 0);
    const priceCents =
      Number(item.priceCents) > 0
        ? Math.round(Number(item.priceCents))
        : dollarsToCents(price);
    const status = String(item.status ?? "available") as VehicleStatus;
    const payload = {
      stockNumber: item.stockNumber ? String(item.stockNumber) : null,
      year: Number(item.year),
      make: String(item.make ?? "Unknown"),
      model: String(item.model ?? "Unknown"),
      trim: item.trim ? String(item.trim) : null,
      priceCents,
      mileage: item.mileage != null ? Number(item.mileage) : null,
      photoUrls: Array.isArray(item.photoUrls)
        ? (item.photoUrls as string[])
        : typeof item.photoUrls === "string"
          ? String(item.photoUrls).split("|").filter(Boolean)
          : [],
      status,
      sourceId,
      lastSyncedAt: new Date(),
      description: item.description ? String(item.description) : null,
    };

    const existing = await prisma.vehicle.findUnique({
      where: { organizationId_vin: { organizationId, vin } },
    });
    if (!existing) {
      await prisma.vehicle.create({
        data: { organizationId, vin, ...payload },
      });
      created += 1;
      continue;
    }

    if (existing.status !== "sold" && status === "sold") {
      soldDetected.push(existing.id);
    }
    if (existing.priceCents !== priceCents) {
      await prisma.vehiclePriceHistory.create({
        data: { vehicleId: existing.id, priceCents },
      });
    }
    await prisma.vehicle.update({
      where: { id: existing.id },
      data: payload,
    });
    updated += 1;
  }

  return { created, updated, soldDetected };
}
