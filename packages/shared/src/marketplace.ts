import type { BodyStyle, FuelType, Transmission, VehicleCondition } from "./schemas.js";

/**
 * Mapping between OpenLot's normalized vehicle model and the human-visible
 * option labels of the Facebook Marketplace "vehicle for sale" form.
 *
 * The extension's content-script adapter matches these labels against the
 * live form. Keeping the mapping here (shared + versioned) lets the API,
 * dashboard preview and extension stay consistent, and makes selector drift
 * a data update instead of a code change.
 */

export const MARKETPLACE_BODY_STYLE_LABELS: Record<BodyStyle, string> = {
  SEDAN: "Saloon",
  SUV: "SUV",
  TRUCK: "Truck",
  COUPE: "Coupé",
  CONVERTIBLE: "Convertible",
  HATCHBACK: "Hatchback",
  WAGON: "Estate",
  MINIVAN: "Minivan",
  VAN: "Van",
  SMALL_CAR: "Small car",
  OTHER: "Other",
};

/** US-English label variants seen on the form (locale drift resilience). */
export const MARKETPLACE_BODY_STYLE_ALTERNATES: Record<BodyStyle, string[]> = {
  SEDAN: ["Sedan", "Saloon"],
  SUV: ["SUV"],
  TRUCK: ["Truck", "Pickup"],
  COUPE: ["Coupe", "Coupé"],
  CONVERTIBLE: ["Convertible"],
  HATCHBACK: ["Hatchback"],
  WAGON: ["Wagon", "Estate"],
  MINIVAN: ["Minivan", "MPV"],
  VAN: ["Van"],
  SMALL_CAR: ["Small car", "Compact"],
  OTHER: ["Other"],
};

export const MARKETPLACE_TRANSMISSION_LABELS: Record<Transmission, string[]> = {
  AUTOMATIC: ["Automatic transmission", "Automatic"],
  MANUAL: ["Manual transmission", "Manual"],
  CVT: ["Automatic transmission", "Automatic"],
  OTHER: ["Other"],
};

export const MARKETPLACE_FUEL_LABELS: Record<FuelType, string[]> = {
  GASOLINE: ["Gasoline", "Petrol"],
  DIESEL: ["Diesel"],
  HYBRID: ["Hybrid"],
  PLUGIN_HYBRID: ["Plug-in hybrid", "Plugin hybrid"],
  ELECTRIC: ["Electric"],
  FLEX: ["Flex", "Flex fuel"],
  OTHER: ["Other"],
};

export const MARKETPLACE_CONDITION_LABELS: Record<VehicleCondition, string[]> = {
  NEW: ["Excellent"],
  CERTIFIED: ["Excellent"],
  USED: ["Good"],
};

/** The flat field payload the extension fills into the Marketplace form. */
export interface MarketplaceListingDraft {
  vehicleId: string;
  vehicleType: "Car/van";
  year: string;
  make: string;
  model: string;
  mileage?: string;
  price?: string;
  bodyStyleLabels?: string[];
  exteriorColor?: string;
  interiorColor?: string;
  conditionLabels?: string[];
  fuelLabels?: string[];
  transmissionLabels?: string[];
  title: string;
  description: string;
  photoUrls: string[];
}

export interface DraftableVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  bodyStyle?: BodyStyle | null;
  condition?: VehicleCondition | null;
  mileage?: number | null;
  priceCents?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  transmission?: Transmission | null;
  fuelType?: FuelType | null;
  description?: string | null;
  photoUrls?: string[] | null;
}

export function buildMarketplaceDraft(v: DraftableVehicle, fallbackDescription: string): MarketplaceListingDraft {
  return {
    vehicleId: v.id,
    vehicleType: "Car/van",
    year: String(v.year),
    make: v.make,
    model: [v.model, v.trim].filter(Boolean).join(" "),
    mileage: v.mileage !== null && v.mileage !== undefined ? String(v.mileage) : undefined,
    price: v.priceCents !== null && v.priceCents !== undefined ? String(Math.round(v.priceCents / 100)) : undefined,
    bodyStyleLabels: v.bodyStyle ? MARKETPLACE_BODY_STYLE_ALTERNATES[v.bodyStyle] : undefined,
    exteriorColor: v.exteriorColor ?? undefined,
    interiorColor: v.interiorColor ?? undefined,
    conditionLabels: v.condition ? MARKETPLACE_CONDITION_LABELS[v.condition] : undefined,
    fuelLabels: v.fuelType ? MARKETPLACE_FUEL_LABELS[v.fuelType] : undefined,
    transmissionLabels: v.transmission ? MARKETPLACE_TRANSMISSION_LABELS[v.transmission] : undefined,
    title: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
    description: v.description?.trim() ? v.description : fallbackDescription,
    photoUrls: v.photoUrls ?? [],
  };
}
