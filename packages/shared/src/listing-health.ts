export const RENEW_AFTER_DAYS = 7;

export interface ListingHealthInput {
  status: string;
  vehiclePrice?: number | null;
  marketplacePrice?: number | null;
  priceAtListing?: number | null;
  listedAt: Date | string;
  lastRenewedAt?: Date | string | null;
  now?: Date;
}

export interface ListingPriceMismatch {
  from: number;
  to: number;
  direction: "up" | "down";
}

export interface ListingHealth {
  priceMismatch: ListingPriceMismatch | null;
  renewDue: boolean;
  daysSinceFreshness: number;
}

function money(value?: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function daysBetween(from: Date | string, to: Date): number {
  const start = from instanceof Date ? from : new Date(from);
  return Math.max(0, Math.floor((to.getTime() - start.getTime()) / 86_400_000));
}

export function getListingHealth(input: ListingHealthInput): ListingHealth {
  const now = input.now ?? new Date();
  const reference = input.lastRenewedAt ?? input.listedAt;
  const daysSinceFreshness = daysBetween(reference, now);
  const listedPrice = money(input.marketplacePrice ?? input.priceAtListing);
  const vehiclePrice = money(input.vehiclePrice);
  const active = input.status === "ACTIVE";

  let priceMismatch: ListingPriceMismatch | null = null;
  if (active && listedPrice != null && vehiclePrice != null && listedPrice !== vehiclePrice) {
    priceMismatch = {
      from: listedPrice,
      to: vehiclePrice,
      direction: vehiclePrice > listedPrice ? "up" : "down",
    };
  }

  return {
    priceMismatch,
    renewDue: active && daysSinceFreshness >= RENEW_AFTER_DAYS,
    daysSinceFreshness,
  };
}

export function hoursSince(from: Date | string | null | undefined, now = new Date()): number | null {
  if (!from) return null;
  const start = from instanceof Date ? from : new Date(from);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 3_600_000));
}
