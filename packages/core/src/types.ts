import { z } from "zod";

export const VEHICLE_STATUSES = ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CONDITIONS = ["NEW", "USED", "CERTIFIED_PRE_OWNED"] as const;
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];

export const VEHICLE_CATEGORIES = [
  "AUTO",
  "RV",
  "MARINE",
  "POWERSPORTS",
  "TRAILER",
  "EQUIPMENT",
  "OTHER",
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const LISTING_STATUSES = [
  "DRAFT",
  "PREPARED",
  "POSTED",
  "DELIST_REQUESTED",
  "DELISTED",
  "ERROR",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const ORG_ROLES = ["OWNER", "MANAGER", "SALESPERSON"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Normalized shape every ingestion path (CSV, feed, manual, VIN decode) produces. */
export const vehicleInputSchema = z.object({
  vin: z.string().trim().toUpperCase().optional().nullable(),
  stockNumber: z.string().trim().max(64).optional().nullable(),
  category: z.enum(VEHICLE_CATEGORIES).default("AUTO"),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2).optional().nullable(),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  trim: z.string().trim().max(120).optional().nullable(),
  bodyStyle: z.string().trim().max(80).optional().nullable(),
  drivetrain: z.string().trim().max(40).optional().nullable(),
  transmission: z.string().trim().max(80).optional().nullable(),
  fuelType: z.string().trim().max(40).optional().nullable(),
  engine: z.string().trim().max(120).optional().nullable(),
  exteriorColor: z.string().trim().max(60).optional().nullable(),
  interiorColor: z.string().trim().max(60).optional().nullable(),
  mileage: z.coerce.number().int().min(0).max(2_000_000).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).optional().nullable(),
  condition: z.enum(VEHICLE_CONDITIONS).default("USED"),
  description: z.string().max(10_000).optional().nullable(),
  photoUrls: z.array(z.string().url()).max(50).default([]),
  sourceRef: z.string().max(255).optional().nullable(),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export interface VehicleLike {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make: string;
  model: string;
  mileage?: number | null;
}
