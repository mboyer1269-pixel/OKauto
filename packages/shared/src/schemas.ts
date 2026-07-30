import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ORG_ROLES = ["OWNER", "MANAGER", "SALESPERSON"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const VEHICLE_STATUSES = ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CONDITIONS = ["NEW", "USED", "CERTIFIED"] as const;
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];

export const BODY_STYLES = [
  "SEDAN", "SUV", "TRUCK", "COUPE", "CONVERTIBLE", "HATCHBACK",
  "WAGON", "MINIVAN", "VAN", "SMALL_CAR", "OTHER",
] as const;
export type BodyStyle = (typeof BODY_STYLES)[number];

export const TRANSMISSIONS = ["AUTOMATIC", "MANUAL", "CVT", "OTHER"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const FUEL_TYPES = ["GASOLINE", "DIESEL", "HYBRID", "PLUGIN_HYBRID", "ELECTRIC", "FLEX", "OTHER"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const DRIVETRAINS = ["FWD", "RWD", "AWD", "FOUR_WD", "OTHER"] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];

export const LISTING_STATUSES = ["DRAFT", "PREPARED", "ACTIVE", "ENDED", "REMOVED", "FAILED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_EVENT_TYPES = [
  "PREPARED", "PUBLISHED", "RENEWED", "PRICE_UPDATED", "MARKED_SOLD", "REMOVED", "FAILED", "NOTE",
] as const;
export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "VEHICLE_SOLD", "PRICE_CHANGED", "SYNC_FAILED", "SYNC_COMPLETED", "LISTING_STALE", "INVITE", "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FEED_TYPES = ["CSV_URL", "JSON_URL"] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export const SYNC_RUN_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a digit"),
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

export const createOrgSchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(40).optional(),
  website: z.string().url().max(300).optional().or(z.literal("")),
  addressLine: z.string().max(240).optional(),
  city: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(2).default("US"),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(ORG_ROLES).default("SALESPERSON"),
});

export const updateMemberSchema = z.object({
  role: z.enum(ORG_ROLES),
});

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

export const vehicleInputSchema = z.object({
  vin: z.string().min(11).max(17).transform((v) => v.trim().toUpperCase()),
  stockNumber: z.string().max(60).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  trim: z.string().max(120).optional(),
  bodyStyle: z.enum(BODY_STYLES).optional(),
  condition: z.enum(VEHICLE_CONDITIONS).default("USED"),
  mileage: z.number().int().min(0).max(2_000_000).optional(),
  priceCents: z.number().int().min(0).max(100_000_000_00).optional(),
  exteriorColor: z.string().max(60).optional(),
  interiorColor: z.string().max(60).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  drivetrain: z.enum(DRIVETRAINS).optional(),
  engine: z.string().max(120).optional(),
  doors: z.number().int().min(1).max(8).optional(),
  description: z.string().max(9000).optional(),
  features: z.array(z.string().max(120)).max(80).default([]),
  photoUrls: z.array(z.string().url().max(2000)).max(40).default([]),
  status: z.enum(VEHICLE_STATUSES).default("AVAILABLE"),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const vehicleUpdateSchema = vehicleInputSchema.partial();
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

export const vehicleQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  make: z.string().max(80).optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["createdAt", "price", "year", "mileage", "updatedAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type VehicleQuery = z.infer<typeof vehicleQuerySchema>;

export const bulkVehicleActionSchema = z.object({
  vehicleIds: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["MARK_SOLD", "MARK_AVAILABLE", "ARCHIVE", "GENERATE_DESCRIPTIONS"]),
});

/* ------------------------------------------------------------------ */
/* Feeds & imports                                                     */
/* ------------------------------------------------------------------ */

export const createFeedSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(FEED_TYPES),
  url: z.string().url().max(2000),
  /** Sync interval in minutes; 0 disables scheduling. */
  intervalMinutes: z.number().int().min(0).max(24 * 60).default(60),
  /** When a vehicle disappears from the feed, mark it sold automatically. */
  markMissingAsSold: z.boolean().default(true),
});
export type CreateFeedInput = z.infer<typeof createFeedSchema>;

export const csvImportSchema = z.object({
  csv: z.string().min(1).max(15_000_000),
  markMissingAsSold: z.boolean().default(false),
});

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export const createListingSchema = z.object({
  vehicleId: z.string().uuid(),
  channel: z.literal("FACEBOOK_MARKETPLACE").default("FACEBOOK_MARKETPLACE"),
});

export const listingEventSchema = z.object({
  type: z.enum(LISTING_EVENT_TYPES),
  message: z.string().max(2000).optional(),
  remoteUrl: z.string().url().max(2000).optional(),
});

/* ------------------------------------------------------------------ */
/* AI descriptions                                                     */
/* ------------------------------------------------------------------ */

export const generateDescriptionSchema = z.object({
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "ENTHUSIASTIC"]).default("PROFESSIONAL"),
  includeDisclaimer: z.boolean().default(true),
  maxLength: z.number().int().min(200).max(8000).default(2500),
});
export type GenerateDescriptionInput = z.infer<typeof generateDescriptionSchema>;

/* ------------------------------------------------------------------ */
/* Shared API envelope                                                 */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
