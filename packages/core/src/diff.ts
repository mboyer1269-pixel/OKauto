import { dedupeKey, type NormalizedVehicle } from "./normalize.js";

export interface ExistingVehicleSnapshot {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  mileage: number | null;
  priceCents: number | null;
  status: string;
  missingSinceSyncs: number;
}

export interface SyncDiff {
  creates: NormalizedVehicle[];
  updates: Array<{ existing: ExistingVehicleSnapshot; incoming: NormalizedVehicle }>;
  priceChanges: Array<{ existing: ExistingVehicleSnapshot; oldPriceCents: number; newPriceCents: number }>;
  /** Vehicles previously seen from this source but absent from this sync. */
  missing: ExistingVehicleSnapshot[];
  /** Vehicles whose consecutive-missing count has now reached the sold threshold. */
  toMarkSold: ExistingVehicleSnapshot[];
}

/**
 * Compute the sync diff between the current DB snapshot for a source and the
 * incoming (already normalized) feed records.
 *
 * Sold detection: a vehicle must be missing for `soldThreshold` *consecutive*
 * syncs before being marked sold, protecting against one-off truncated feeds.
 */
export function computeSyncDiff(
  existing: ExistingVehicleSnapshot[],
  incoming: NormalizedVehicle[],
  opts: { soldThreshold: number },
): SyncDiff {
  const existingByKey = new Map<string, ExistingVehicleSnapshot>();
  for (const v of existing) existingByKey.set(dedupeKey(v), v);

  // Dedupe incoming records among themselves (last one wins).
  const incomingByKey = new Map<string, NormalizedVehicle>();
  for (const record of incoming) incomingByKey.set(dedupeKey(record), record);

  const diff: SyncDiff = { creates: [], updates: [], priceChanges: [], missing: [], toMarkSold: [] };
  const seenKeys = new Set<string>();

  for (const [key, record] of incomingByKey) {
    const match = existingByKey.get(key);
    if (!match) {
      diff.creates.push(record);
      continue;
    }
    seenKeys.add(key);
    diff.updates.push({ existing: match, incoming: record });
    if (
      record.priceCents != null &&
      match.priceCents != null &&
      record.priceCents !== match.priceCents
    ) {
      diff.priceChanges.push({
        existing: match,
        oldPriceCents: match.priceCents,
        newPriceCents: record.priceCents,
      });
    }
  }

  for (const [key, snapshot] of existingByKey) {
    if (seenKeys.has(key)) continue;
    if (snapshot.status === "SOLD" || snapshot.status === "ARCHIVED") continue;
    diff.missing.push(snapshot);
    if (snapshot.missingSinceSyncs + 1 >= opts.soldThreshold) {
      diff.toMarkSold.push(snapshot);
    }
  }

  return diff;
}
