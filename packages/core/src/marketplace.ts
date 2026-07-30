/**
 * Mapping from normalized LotPilot vehicles to Facebook Marketplace's
 * vehicle-listing form vocabulary. Used by the extension's fill-assist overlay.
 * Values mirror the publicly visible options of the Marketplace vehicle form.
 */

import { type DescribableVehicle, vehicleTitle } from "./describe.js";

export const FB_BODY_STYLES = [
  "Coupe",
  "Truck",
  "Sedan",
  "Hatchback",
  "SUV",
  "Convertible",
  "Wagon",
  "Minivan",
  "Small Car",
  "Other",
] as const;
export type FbBodyStyle = (typeof FB_BODY_STYLES)[number];

export const FB_VEHICLE_CONDITIONS = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
] as const;

export const FB_FUEL_TYPES = [
  "Diesel",
  "Electric",
  "Gasoline",
  "Flex",
  "Hybrid",
  "Petrol",
  "Plug-in hybrid",
  "Other",
] as const;

export const FB_TRANSMISSIONS = ["Manual transmission", "Automatic transmission"] as const;

export function mapBodyStyle(bodyStyle: string | null | undefined): FbBodyStyle {
  if (!bodyStyle) return "Other";
  const b = bodyStyle.toLowerCase();
  if (/(pickup|truck)/.test(b)) return "Truck";
  if (/(suv|sport utility|crossover|cuv)/.test(b)) return "SUV";
  if (/sedan/.test(b)) return "Sedan";
  if (/coupe/.test(b)) return "Coupe";
  if (/hatch/.test(b)) return "Hatchback";
  if (/(convertible|cabriolet|roadster)/.test(b)) return "Convertible";
  if (/wagon/.test(b)) return "Wagon";
  if (/(minivan|van)/.test(b)) return "Minivan";
  if (/(compact|city car|micro)/.test(b)) return "Small Car";
  return "Other";
}

export function mapFuelType(fuel: string | null | undefined): (typeof FB_FUEL_TYPES)[number] {
  if (!fuel) return "Gasoline";
  const f = fuel.toLowerCase();
  if (f.includes("diesel")) return "Diesel";
  if (f.includes("plug")) return "Plug-in hybrid";
  if (f.includes("hybrid")) return "Hybrid";
  if (f.includes("electric") || f.includes("bev")) return "Electric";
  if (f.includes("flex") || f.includes("e85")) return "Flex";
  return "Gasoline";
}

export function mapTransmission(t: string | null | undefined): (typeof FB_TRANSMISSIONS)[number] {
  if (t && /manual|standard|stick/i.test(t)) return "Manual transmission";
  return "Automatic transmission";
}

/** Marketplace mapping of dealer condition → FB's subjective condition scale. */
export function mapCondition(condition: string, mileage: number | null | undefined): (typeof FB_VEHICLE_CONDITIONS)[number] {
  if (condition === "NEW") return "Excellent";
  if (condition === "CERTIFIED_PRE_OWNED") return "Excellent";
  if (mileage == null) return "Good";
  if (mileage < 30_000) return "Excellent";
  if (mileage < 70_000) return "Very Good";
  if (mileage < 120_000) return "Good";
  return "Fair";
}

export interface MarketplaceListingFields {
  title: string;
  vehicleType: "Car/Truck";
  year: string | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: string | null;
  price: string | null;
  bodyStyle: FbBodyStyle;
  condition: (typeof FB_VEHICLE_CONDITIONS)[number];
  fuelType: (typeof FB_FUEL_TYPES)[number];
  transmission: (typeof FB_TRANSMISSIONS)[number];
  exteriorColor: string | null;
  interiorColor: string | null;
  description: string;
}

export function toMarketplaceFields(
  v: DescribableVehicle & { description?: string | null },
): MarketplaceListingFields {
  return {
    title: vehicleTitle(v),
    vehicleType: "Car/Truck",
    year: v.year != null ? String(v.year) : null,
    make: v.make,
    model: [v.model, v.trim].filter(Boolean).join(" "),
    trim: v.trim ?? null,
    mileage: v.mileage != null ? String(v.mileage) : null,
    price: v.priceCents != null ? String(Math.round(v.priceCents / 100)) : null,
    bodyStyle: mapBodyStyle(v.bodyStyle),
    condition: mapCondition(v.condition, v.mileage),
    fuelType: mapFuelType(v.fuelType),
    transmission: mapTransmission(v.transmission),
    exteriorColor: v.exteriorColor ?? null,
    interiorColor: v.interiorColor ?? null,
    description: v.description ?? "",
  };
}
