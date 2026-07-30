/** Vehicle domain operations: normalize → persist, and batch import with dedup. */
import { prisma, type Prisma } from '@okauto/db';
import {
  buildIndex,
  buildVehicleTitle,
  computeDedupKeys,
  findDuplicate,
  normalizeVehicle,
  parseCsv,
  type NormalizedVehicle,
  type RawVehicleInput,
} from '@okauto/shared';

export function normalizedToCreateData(
  organizationId: string,
  n: NormalizedVehicle,
): Prisma.VehicleUncheckedCreateInput {
  const keys = computeDedupKeys(n);
  return {
    organizationId,
    vin: n.vin,
    stockNumber: n.stockNumber,
    category: n.category,
    year: n.year,
    make: n.make,
    model: n.model,
    trim: n.trim,
    bodyStyle: n.bodyStyle,
    mileage: n.mileage,
    priceCents: n.priceCents,
    exteriorColor: n.exteriorColor,
    interiorColor: n.interiorColor,
    fuelType: n.fuelType ?? undefined,
    transmission: n.transmission ?? undefined,
    drivetrain: n.drivetrain,
    engine: n.engine,
    condition: n.condition,
    features: n.features,
    title: buildVehicleTitle(n),
    dedupSignature: keys.fuzzySignature,
  };
}

export interface ImportRowResult {
  row: number;
  status: 'created' | 'updated' | 'duplicate' | 'error';
  vehicleId?: string;
  title?: string;
  reason?: string;
}

export interface ImportOutcome {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  results: ImportRowResult[];
}

export function parseImportContent(format: 'csv' | 'json', content: string): RawVehicleInput[] {
  if (format === 'json') {
    const parsed = JSON.parse(content) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr as RawVehicleInput[];
  }
  return parseCsv(content) as RawVehicleInput[];
}

/**
 * Import rows into an org's inventory. Deduplicates within the batch and against
 * existing inventory. Existing matches by VIN/stock are *updated* (price/mileage refresh);
 * fuzzy matches are reported as duplicates (not auto-merged) to avoid false merges.
 */
export async function importVehicles(
  organizationId: string,
  rows: RawVehicleInput[],
): Promise<ImportOutcome> {
  const existing = await prisma.vehicle.findMany({
    where: { organizationId },
    select: {
      id: true, vin: true, stockNumber: true, category: true, year: true, make: true,
      model: true, trim: true, mileage: true, priceCents: true,
    },
  });

  const index = buildIndex(
    existing.map((e) => ({
      id: e.id,
      ...normalizeVehicle({
        vin: e.vin,
        stockNumber: e.stockNumber,
        category: e.category,
        year: e.year,
        make: e.make,
        model: e.model,
        trim: e.trim,
        mileage: e.mileage,
        priceCents: e.priceCents,
      }),
    })),
  );

  const outcome: ImportOutcome = {
    totalRows: rows.length,
    createdCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    results: [],
  };

  const seenInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 1;
    try {
      const normalized = normalizeVehicle(rows[i]!);
      if (!normalized.make && !normalized.model && !normalized.vin) {
        outcome.errorCount += 1;
        outcome.results.push({ row: rowNumber, status: 'error', reason: 'Missing make/model/VIN' });
        continue;
      }

      const keys = computeDedupKeys(normalized);
      const batchKey = keys.vin ?? keys.stockKey ?? keys.fuzzySignature;
      if (seenInBatch.has(batchKey)) {
        outcome.duplicateCount += 1;
        outcome.results.push({ row: rowNumber, status: 'duplicate', reason: 'Duplicate within file' });
        continue;
      }
      seenInBatch.add(batchKey);

      const dup = findDuplicate(normalized, index);
      if (dup && (dup.reason === 'vin' || dup.reason === 'stock')) {
        const updated = await prisma.vehicle.update({
          where: { id: dup.existingId },
          data: {
            priceCents: normalized.priceCents ?? undefined,
            mileage: normalized.mileage ?? undefined,
            status: 'AVAILABLE',
          },
        });
        outcome.updatedCount += 1;
        outcome.results.push({ row: rowNumber, status: 'updated', vehicleId: updated.id, title: updated.title });
        continue;
      }
      if (dup && dup.reason === 'fuzzy') {
        outcome.duplicateCount += 1;
        outcome.results.push({
          row: rowNumber,
          status: 'duplicate',
          vehicleId: dup.existingId,
          reason: 'Likely duplicate (year/make/model/mileage match, no VIN)',
        });
        continue;
      }

      const created = await prisma.vehicle.create({
        data: normalizedToCreateData(organizationId, normalized),
      });
      // Add to index so later rows dedup against it.
      if (keys.vin) index.byVin.set(keys.vin, created.id);
      if (keys.stockKey) index.byStock.set(keys.stockKey, created.id);
      index.byFuzzy.set(keys.fuzzySignature, created.id);

      outcome.createdCount += 1;
      outcome.results.push({ row: rowNumber, status: 'created', vehicleId: created.id, title: created.title });
    } catch (error) {
      outcome.errorCount += 1;
      outcome.results.push({ row: rowNumber, status: 'error', reason: String(error) });
    }
  }

  return outcome;
}
