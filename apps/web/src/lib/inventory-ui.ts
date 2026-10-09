import { RENEW_AFTER_DAYS } from "@okauto/shared";

export type MarketplaceStatus = "never" | "active" | "renew" | "sold";

export interface InventoryListingSummary {
  status?: string;
  listedAt?: string | null;
  lastRenewedAt?: string | null;
}

export interface InventoryVehicleLike {
  status: string;
  createdAt?: string | null;
  price?: number | string | null;
  trim?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  description?: string | null;
  photos?: Array<{ url?: string | null }>;
  listings?: InventoryListingSummary[];
  _count?: { listings?: number };
}

export function daysInStock(
  createdAt: string | Date | null | undefined,
  now = new Date(),
): number {
  if (!createdAt) return 0;
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((now.getTime() - start.getTime()) / 86_400_000),
  );
}

export function daysTone(days: number): "signal" | "warning" | "danger" {
  if (days < 30) return "signal";
  if (days <= 60) return "warning";
  return "danger";
}

export function marketplaceStatus(
  vehicle: InventoryVehicleLike,
  now = new Date(),
): MarketplaceStatus {
  if (vehicle.status === "SOLD") return "sold";
  const listing = vehicle.listings?.find((item) => item.status === "ACTIVE");
  if (!listing) return "never";
  const reference = listing.lastRenewedAt ?? listing.listedAt;
  if (!reference) return "active";
  const start = new Date(reference);
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return days >= RENEW_AFTER_DAYS ? "renew" : "active";
}

export const MARKETPLACE_LABEL: Record<MarketplaceStatus, string> = {
  never: "Jamais publié",
  active: "Active",
  renew: "À renouveler",
  sold: "Vendu",
};

export function completeness(vehicle: InventoryVehicleLike): {
  score: number;
  percent: number;
  parts: { photos: boolean; description: boolean; build: boolean; price: boolean };
} {
  const parts = {
    photos: Boolean(vehicle.photos?.some((photo) => photo.url)),
    description: Boolean(vehicle.description?.trim()),
    build: Boolean(
      vehicle.trim &&
        (vehicle.engine || vehicle.transmission || vehicle.drivetrain),
    ),
    price: vehicle.price != null && vehicle.price !== "",
  };
  const score = Object.values(parts).filter(Boolean).length;
  return { score, percent: Math.round((score / 4) * 100), parts };
}

export type SavedView =
  | "all"
  | "ready"
  | "renew"
  | "nophoto"
  | "aged"
  | "nobuild";

export const SAVED_VIEWS: Array<{ id: SavedView; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "ready", label: "Sans annonce active" },
  { id: "renew", label: "À renouveler" },
  { id: "nophoto", label: "Sans photos" },
  { id: "aged", label: "> 45 jours" },
  { id: "nobuild", label: "Build manquant" },
];

export function matchesSavedView(
  vehicle: InventoryVehicleLike & { createdAt?: string | null },
  view: SavedView,
): boolean {
  if (view === "all") return true;
  const market = marketplaceStatus(vehicle);
  const complete = completeness(vehicle);
  if (view === "ready") {
    return vehicle.status === "AVAILABLE" && market === "never";
  }
  if (view === "renew") return market === "renew";
  if (view === "nophoto") return !complete.parts.photos;
  if (view === "aged") return daysInStock(vehicle.createdAt) > 45;
  if (view === "nobuild") return !complete.parts.build;
  return true;
}

const INVENTORY_SHORTCUT_IGNORE =
  "a,button,input,textarea,select,summary,option,[contenteditable],[contenteditable=''],[contenteditable='true'],[role='button'],[role='link'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch'],[role='combobox'],[role='option'],[role='slider'],[tabindex]:not([tabindex='-1'])";

export function isInventoryShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tag = el.tagName?.toUpperCase();
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    tag === "SUMMARY" ||
    tag === "OPTION"
  ) {
    return true;
  }
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    return Boolean(el.closest(INVENTORY_SHORTCUT_IGNORE));
  }
  return false;
}
