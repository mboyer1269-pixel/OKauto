import { z } from "zod";

export const RoleSchema = z.enum(["OWNER", "MANAGER", "SALESPERSON", "ANALYST"]);
export type Role = z.infer<typeof RoleSchema>;

export const VehicleStatusSchema = z.enum([
  "AVAILABLE",
  "PENDING",
  "SOLD",
  "WHOLESALE",
  "ARCHIVED"
]);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const ListingStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "POSTED",
  "PRICE_CHANGE",
  "SOLD_ALERT",
  "REMOVAL_REQUESTED",
  "REMOVED",
  "ERROR"
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const SourceTypeSchema = z.enum([
  "CSV",
  "DMS",
  "WEBSITE",
  "EXTENSION",
  "MANUAL",
  "API"
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const NotificationTypeSchema = z.enum([
  "SOLD_ALERT",
  "PRICE_CHANGE",
  "SYNC_FAILURE",
  "DUPLICATE_DETECTED",
  "SECURITY"
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;

export const VehicleInputSchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(vinPattern, "VIN must be 17 characters and exclude I, O, and Q")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  stockNumber: z.string().trim().min(1).max(64).optional(),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  trim: z.string().trim().max(120).optional(),
  bodyStyle: z.string().trim().max(80).optional(),
  drivetrain: z.string().trim().max(80).optional(),
  transmission: z.string().trim().max(80).optional(),
  fuelType: z.string().trim().max(80).optional(),
  exteriorColor: z.string().trim().max(80).optional(),
  interiorColor: z.string().trim().max(80).optional(),
  mileage: z.coerce.number().int().min(0).max(999999).optional(),
  price: z.coerce.number().int().min(0).max(9999999).optional(),
  status: VehicleStatusSchema.default("AVAILABLE"),
  location: z.string().trim().max(160).optional(),
  features: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  notes: z.string().trim().max(5000).optional()
});
export type VehicleInput = z.infer<typeof VehicleInputSchema>;

export const VehicleMediaSchema = z.object({
  url: z.string().url(),
  alt: z.string().trim().max(160).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  source: SourceTypeSchema.default("WEBSITE")
});
export type VehicleMedia = z.infer<typeof VehicleMediaSchema>;

export const CapturePayloadSchema = z.object({
  sourceUrl: z.string().url(),
  sourceType: SourceTypeSchema.default("EXTENSION"),
  capturedAt: z.coerce.date().default(() => new Date()),
  dealershipId: z.string().uuid().optional(),
  vehicle: VehicleInputSchema,
  photos: z.array(z.string().url()).max(80).default([]),
  rawText: z.string().trim().max(50000).optional(),
  adapterVersion: z.string().trim().max(32).default("generic-v1")
});
export type CapturePayload = z.infer<typeof CapturePayloadSchema>;

export const ListingDraftSchema = z.object({
  vehicleId: z.string().uuid(),
  title: z.string().trim().min(8).max(120),
  description: z.string().trim().min(40).max(5000),
  price: z.coerce.number().int().min(0).max(9999999).optional(),
  location: z.string().trim().max(160).optional(),
  marketplaceUrl: z.string().url().optional(),
  status: ListingStatusSchema.default("DRAFT"),
  assignedToUserId: z.string().uuid().optional()
});
export type ListingDraft = z.infer<typeof ListingDraftSchema>;

export const DashboardMetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  delta: z.string().optional(),
  tone: z.enum(["neutral", "good", "warn", "critical"]).default("neutral")
});
export type DashboardMetric = z.infer<typeof DashboardMetricSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const DashboardResponseSchema = z.object({
  metrics: z.array(DashboardMetricSchema),
  inventory: z.array(
    VehicleInputSchema.extend({
      id: z.string(),
      updatedAt: z.string(),
      salesperson: z.string().optional(),
      listingStatus: ListingStatusSchema.optional(),
      photoCount: z.number().int().min(0).default(0)
    })
  ),
  listings: z.array(
    z.object({
      id: z.string(),
      vehicleId: z.string(),
      title: z.string(),
      status: ListingStatusSchema,
      salesperson: z.string().optional(),
      marketplaceUrl: z.string().url().optional(),
      postedAt: z.string().optional(),
      updatedAt: z.string()
    })
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      actor: z.string(),
      action: z.string(),
      target: z.string(),
      createdAt: z.string()
    })
  ),
  notifications: z.array(
    z.object({
      id: z.string(),
      type: NotificationTypeSchema,
      title: z.string(),
      message: z.string(),
      severity: z.enum(["info", "warning", "critical"]),
      resolvedAt: z.string().optional()
    })
  ),
  syncHealth: z.array(
    z.object({
      source: z.string(),
      status: z.enum(["healthy", "warning", "failed"]),
      lastRunAt: z.string(),
      message: z.string()
    })
  )
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
