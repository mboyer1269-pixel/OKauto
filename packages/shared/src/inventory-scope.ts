export const ON_SALE_VEHICLE_STATUSES = ["AVAILABLE", "PENDING"] as const;
export const OFF_SALE_VEHICLE_STATUSES = ["SOLD", "ARCHIVED"] as const;
export const ON_SALE_FEED_ABSENCE_STATUSES = ["IN_FEED", "KEPT"] as const;
export const FEED_ABSENCE_REVIEW_STATUS = "PENDING_REVIEW" as const;

export type OnSaleVehicleStatus = (typeof ON_SALE_VEHICLE_STATUSES)[number];
export type OnSaleFeedAbsenceStatus =
  (typeof ON_SALE_FEED_ABSENCE_STATUSES)[number];

export type InventoryScopeVehicle = {
  status?: string | null;
  feedAbsenceStatus?: string | null;
};

export type InventoryScopeListing = {
  status?: string | null;
  vehicle?: InventoryScopeVehicle | null;
};

/** Véhicule réellement en vente : AVAILABLE/PENDING, pas SOLD/ARCHIVED, pas en revue d’absence. */
export function isOnSaleVehicle(vehicle: InventoryScopeVehicle): boolean {
  const status = vehicle.status ?? "";
  const feed = vehicle.feedAbsenceStatus ?? "IN_FEED";
  return (
    (ON_SALE_VEHICLE_STATUSES as readonly string[]).includes(status) &&
    (ON_SALE_FEED_ABSENCE_STATUSES as readonly string[]).includes(feed)
  );
}

/** Clause Prisma partagée pour lister ou compter l’inventaire en vente. */
export function onSaleVehicleWhere() {
  return {
    status: { in: [...ON_SALE_VEHICLE_STATUSES] },
    feedAbsenceStatus: { in: [...ON_SALE_FEED_ABSENCE_STATUSES] },
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
): boolean {
  if (listing.status !== "ACTIVE") return false;
  const vehicle = listing.vehicle;
  if (!vehicle) return false;
  return (
    vehicle.status === "SOLD" ||
    vehicle.status === "ARCHIVED" ||
    vehicle.feedAbsenceStatus === FEED_ABSENCE_REVIEW_STATUS
  );
}

export function listingNeedsMarketplaceRemovalWhere() {
  return {
    status: "ACTIVE" as const,
    vehicle: {
      OR: [
        { status: "SOLD" as const },
        { status: "ARCHIVED" as const },
        { feedAbsenceStatus: FEED_ABSENCE_REVIEW_STATUS },
      ],
    },
  };
}
