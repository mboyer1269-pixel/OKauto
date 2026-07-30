/**
 * Sold-vehicle and price-change detection.
 *
 * Given a previous inventory snapshot and a new feed, compute which vehicles were sold
 * (removed or explicitly marked), which changed price, and which are newly added. This
 * drives takedown alerts and notifications. Detection is deterministic and unit-tested.
 */

export interface InventorySnapshotItem {
  /** Stable external key: prefer VIN, else stock number. */
  key: string;
  priceCents: number | null;
  status?: string | null;
}

export interface PriceChange {
  key: string;
  previousPriceCents: number | null;
  newPriceCents: number | null;
  /** Positive = increase, negative = decrease. */
  deltaCents: number;
}

export interface DetectionResult {
  soldKeys: string[];
  addedKeys: string[];
  priceChanges: PriceChange[];
  unchangedKeys: string[];
}

const SOLD_STATUSES = new Set(['sold', 'pending_sale', 'pending', 'delivered']);

export function detectInventoryChanges(
  previous: InventorySnapshotItem[],
  next: InventorySnapshotItem[],
): DetectionResult {
  const prevByKey = new Map(previous.map((i) => [i.key, i]));
  const nextByKey = new Map(next.map((i) => [i.key, i]));

  const soldKeys: string[] = [];
  const addedKeys: string[] = [];
  const priceChanges: PriceChange[] = [];
  const unchangedKeys: string[] = [];

  // Items present before but gone now → treated as sold/removed.
  for (const [key] of prevByKey) {
    if (!nextByKey.has(key)) soldKeys.push(key);
  }

  for (const [key, nextItem] of nextByKey) {
    const prevItem = prevByKey.get(key);
    if (!prevItem) {
      addedKeys.push(key);
      continue;
    }
    // Explicit sold status in the new feed.
    if (nextItem.status && SOLD_STATUSES.has(nextItem.status.toLowerCase())) {
      soldKeys.push(key);
      continue;
    }
    if (
      prevItem.priceCents !== nextItem.priceCents &&
      (prevItem.priceCents !== null || nextItem.priceCents !== null)
    ) {
      priceChanges.push({
        key,
        previousPriceCents: prevItem.priceCents,
        newPriceCents: nextItem.priceCents,
        deltaCents: (nextItem.priceCents ?? 0) - (prevItem.priceCents ?? 0),
      });
    } else {
      unchangedKeys.push(key);
    }
  }

  return { soldKeys, addedKeys, priceChanges, unchangedKeys };
}

/** Listings that must be taken down because their vehicle is no longer for sale. */
export function listingsNeedingTakedown<T extends { vehicleKey: string; status: string }>(
  activeListings: T[],
  soldKeys: string[],
): T[] {
  const sold = new Set(soldKeys);
  const active = new Set(['ACTIVE', 'PENDING', 'READY']);
  return activeListings.filter((l) => sold.has(l.vehicleKey) && active.has(l.status));
}
