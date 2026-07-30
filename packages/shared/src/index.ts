import { z } from "zod";

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "SALESPERSON"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 50,
  SALESPERSON: 10,
};

export function hasMinRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

export const VEHICLE_STATUSES = [
  "AVAILABLE",
  "PENDING",
  "SOLD",
  "ARCHIVED",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CATEGORIES = [
  "AUTOMOTIVE",
  "RV",
  "MARINE",
  "POWERSPORTS",
  "MOBILE_HOME",
  "FARM_EQUIPMENT",
  "OTHER",
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const LISTING_STATUSES = [
  "DRAFT",
  "READY",
  "ASSISTING",
  "PUBLISHED",
  "NEEDS_REMOVAL",
  "REMOVED",
  "FAILED",
  "PRICE_STALE",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const SOURCE_TYPES = [
  "CSV_UPLOAD",
  "FEED_URL",
  "WEBSITE",
  "MANUAL",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(128),
  name: z.string().min(1).max(120),
  organizationName: z.string().min(2).max(160),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const vehicleCreateSchema = z.object({
  vin: z.string().min(5).max(32).optional().nullable(),
  stockNumber: z.string().min(1).max(64),
  year: z.number().int().min(1900).max(2100),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  trim: z.string().max(80).optional().nullable(),
  priceCents: z.number().int().min(0),
  mileage: z.number().int().min(0).optional().nullable(),
  bodyStyle: z.string().max(80).optional().nullable(),
  exteriorColor: z.string().max(80).optional().nullable(),
  interiorColor: z.string().max(80).optional().nullable(),
  drivetrain: z.string().max(40).optional().nullable(),
  transmission: z.string().max(40).optional().nullable(),
  fuelType: z.string().max(40).optional().nullable(),
  description: z.string().max(10000).optional().nullable(),
  category: z.enum(VEHICLE_CATEGORIES).default("AUTOMOTIVE"),
  status: z.enum(VEHICLE_STATUSES).default("AVAILABLE"),
  photoUrls: z.array(z.string().url()).max(50).optional(),
});

export const listingCreateSchema = z.object({
  vehicleId: z.string().cuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  priceCents: z.number().int().min(0).optional(),
});

export const listingUpdateSchema = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  externalUrl: z.string().url().optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  priceCents: z.number().int().min(0).optional(),
  failureReason: z.string().max(1000).optional().nullable(),
});

export const describeSchema = z.object({
  tone: z.enum(["professional", "friendly", "urgent"]).default("professional"),
  includePrice: z.boolean().default(true),
  maxLength: z.number().int().min(100).max(5000).default(1200),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});

export const csvVehicleRowSchema = z.object({
  vin: z.string().optional(),
  stockNumber: z.string().min(1),
  year: z.coerce.number().int(),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().optional(),
  price: z.coerce.number(),
  mileage: z.coerce.number().optional(),
  bodyStyle: z.string().optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  drivetrain: z.string().optional(),
  transmission: z.string().optional(),
  fuelType: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  photos: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>;

export function formatVehicleTitle(v: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const POLICY = {
  humanInTheLoop: true,
  neverBypassCaptcha: true,
  neverBypassAuth: true,
  respectRateLimits: true,
  platform: "facebook-marketplace-assistive-only",
} as const;
