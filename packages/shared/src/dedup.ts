/**
 * Duplicate prevention for inventory. Detects duplicates by VIN (exact), stock number
 * (exact, case-insensitive), and a fuzzy signature (year+make+model+mileage bucket) to
 * catch re-imports of the same unit without a VIN.
 */
import type { NormalizedVehicle } from './types.js';

export interface DedupKeys {
  vin: string | null;
  stockKey: string | null;
  fuzzySignature: string;
}

export type DuplicateReason = 'vin' | 'stock' | 'fuzzy';

export interface DuplicateMatch {
  reason: DuplicateReason;
  existingId: string;
}

export function computeDedupKeys(v: NormalizedVehicle): DedupKeys {
  const stockKey = v.stockNumber ? v.stockNumber.trim().toLowerCase() : null;
  // Bucket mileage into 1,000-mile bins so tiny odometer differences still match.
  const mileageBucket = v.mileage === null ? 'x' : String(Math.round(v.mileage / 1000));
  const fuzzySignature = [
    v.year ?? 'x',
    (v.make ?? 'x').toLowerCase(),
    (v.model ?? 'x').toLowerCase(),
    mileageBucket,
  ].join('|');
  return { vin: v.vin, stockKey, fuzzySignature };
}

export interface ExistingVehicleIndex {
  byVin: Map<string, string>;
  byStock: Map<string, string>;
  byFuzzy: Map<string, string>;
}

export function buildIndex(
  existing: Array<{ id: string } & NormalizedVehicle>,
): ExistingVehicleIndex {
  const byVin = new Map<string, string>();
  const byStock = new Map<string, string>();
  const byFuzzy = new Map<string, string>();
  for (const item of existing) {
    const keys = computeDedupKeys(item);
    if (keys.vin) byVin.set(keys.vin, item.id);
    if (keys.stockKey) byStock.set(keys.stockKey, item.id);
    byFuzzy.set(keys.fuzzySignature, item.id);
  }
  return { byVin, byStock, byFuzzy };
}

/**
 * Returns the first duplicate match found for a candidate, or null. VIN and stock are
 * strong signals; the fuzzy signature is only used when the candidate has no VIN (to
 * avoid false positives across genuinely different units with the same trim/mileage).
 */
export function findDuplicate(
  candidate: NormalizedVehicle,
  index: ExistingVehicleIndex,
): DuplicateMatch | null {
  const keys = computeDedupKeys(candidate);
  if (keys.vin) {
    const id = index.byVin.get(keys.vin);
    if (id) return { reason: 'vin', existingId: id };
  }
  if (keys.stockKey) {
    const id = index.byStock.get(keys.stockKey);
    if (id) return { reason: 'stock', existingId: id };
  }
  if (!keys.vin) {
    const id = index.byFuzzy.get(keys.fuzzySignature);
    if (id) return { reason: 'fuzzy', existingId: id };
  }
  return null;
}
