export const ON_SALE_VEHICLE_STATUSES = ["AVAILABLE", "PENDING"] as const;
export const OFF_SALE_VEHICLE_STATUSES = ["SOLD", "ARCHIVED"] as const;
export const ON_SALE_FEED_ABSENCE_STATUSES = ["IN_FEED", "KEPT"] as const;
export const FEED_ABSENCE_REVIEW_STATUS = "PENDING_REVIEW" as const;
export const STALE_UNSEEN_HOURS = 48;

export type OnSaleVehicleStatus = (typeof ON_SALE_VEHICLE_STATUSES)[number];
export type OnSaleFeedAbsenceStatus =
  (typeof ON_SALE_FEED_ABSENCE_STATUSES)[number];

export type InventoryScopeSyncSource = {
  isActive?: boolean | null;
  lastSyncStatus?: string | null;
  lastSyncAt?: Date | string | null;
};

export type InventoryScopeVehicle = {
  status?: string | null;
  feedAbsenceStatus?: string | null;
  lastSeenAt?: Date | string | null;
  syncSourceId?: string | null;
  syncSource?: InventoryScopeSyncSource | null;
};

export type InventoryScopeListing = {
  status?: string | null;
  vehicle?: InventoryScopeVehicle | null;
};

export function daysUnseenSince(
  lastSeenAt: Date | string,
  now = new Date(),
): number {
  const start = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(
    1,
    Math.floor((now.getTime() - start.getTime()) / 86_400_000),
  );
}

export function staleUnseenReviewReason(
  lastSeenAt: Date | string,
  now = new Date(),
): string {
  const days = daysUnseenSince(lastSeenAt, now);
  return `non vu depuis ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * AVAILABLE encore en base, mais la synchro active a réussi depuis
 * plus de 48 h sans revoir le véhicule. Filtre d’affichage seulement.
 *
 * KEPT (décision humaine « garder en inventaire ») est exclu : on ne
 * retouche pas lastSeenAt. La synchro le remet en IN_FEED si elle le
 * revoit, puis en PENDING_REVIEW s’il disparaît à nouveau.
 *
 * lastSyncStatus doit être exactement "success". Un statut "partial"
 * (ou error / null) est prudent : le véhicule reste compté, le flux
 * ayant pu être tronqué.
 */
export function isStaleUnseenFromSync(
  vehicle: InventoryScopeVehicle,
  now = new Date(),
): boolean {
  if (vehicle.feedAbsenceStatus === "KEPT") return false;
  if (!vehicle.syncSourceId && !vehicle.syncSource) return false;
  const source = vehicle.syncSource;
  if (!source?.isActive) return false;
  if (source.lastSyncStatus !== "success") return false;
  if (!vehicle.lastSeenAt || !source.lastSyncAt) return false;
  const lastSeen = new Date(vehicle.lastSeenAt);
  const lastSync = new Date(source.lastSyncAt);
  if (Number.isNaN(lastSeen.getTime()) || Number.isNaN(lastSync.getTime())) {
    return false;
  }
  if (now.getTime() - lastSeen.getTime() <= STALE_UNSEEN_HOURS * 3_600_000) {
    return false;
  }
  return lastSync.getTime() > lastSeen.getTime();
}

/** Véhicule réellement en vente : AVAILABLE/PENDING, pas SOLD/ARCHIVED, pas en revue d’absence, pas périmé. */
export function isOnSaleVehicle(
  vehicle: InventoryScopeVehicle,
  now = new Date(),
): boolean {
  const status = vehicle.status ?? "";
  const feed = vehicle.feedAbsenceStatus ?? "IN_FEED";
  return (
    (ON_SALE_VEHICLE_STATUSES as readonly string[]).includes(status) &&
    (ON_SALE_FEED_ABSENCE_STATUSES as readonly string[]).includes(feed) &&
    !isStaleUnseenFromSync(vehicle, now)
  );
}

/** Clause Prisma partagée pour l’état en vente (hors lastSeenAt, comparé via IDs). */
export function onSaleVehicleWhere() {
  return {
    status: { in: [...ON_SALE_VEHICLE_STATUSES] },
    feedAbsenceStatus: { in: [...ON_SALE_FEED_ABSENCE_STATUSES] },
  };
}

/**
 * Clause Prisma « en vente », sans jamais poser de clé `id`.
 * Les IDs périmés passent par `NOT` pour ne pas écraser un `id`
 * (ni un `AND` / `OR`) déjà présent sur le where de l’appelant.
 */
export function onSaleListingVehicleWhere(staleUnseenIds: string[] = []) {
  return {
    ...onSaleVehicleWhere(),
    ...(staleUnseenIds.length > 0
      ? { NOT: { id: { in: staleUnseenIds } } }
      : {}),
  };
}

export function soldHistoryVehicleWhere() {
  return { status: "SOLD" as const };
}

export function pendingFeedReviewWhere() {
  return { feedAbsenceStatus: FEED_ABSENCE_REVIEW_STATUS };
}

/** Annonce Marketplace encore ACTIVE alors que le véhicule n’est plus en vente. */
export function listingNeedsMarketplaceRemoval(
  listing: InventoryScopeListing,
  now = new Date(),
): boolean {
  if (listing.status !== "ACTIVE") return false;
  const vehicle = listing.vehicle;
  if (!vehicle) return false;
  return !isOnSaleVehicle(vehicle, now);
}

export function listingNeedsMarketplaceRemovalWhere(
  staleUnseenIds: string[] = [],
) {
  return {
    status: "ACTIVE" as const,
    vehicle: {
      OR: [
        { status: "SOLD" as const },
        { status: "ARCHIVED" as const },
        { feedAbsenceStatus: FEED_ABSENCE_REVIEW_STATUS },
        ...(staleUnseenIds.length > 0 ? [{ id: { in: staleUnseenIds } }] : []),
      ],
    },
  };
}
