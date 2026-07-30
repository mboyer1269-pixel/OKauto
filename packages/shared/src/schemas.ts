import { z } from "zod";
import {
  BODY_STYLES,
  DRIVETRAINS,
  FUEL_TYPES,
  IMPORT_SOURCE_TYPES,
  LISTING_CHANNELS,
  LISTING_STATUSES,
  ROLES,
  TRANSMISSIONS,
  VEHICLE_CONDITIONS,
  VEHICLE_STATUSES,
  VERTICALS,
} from "./enums.js";
import {
  DESCRIPTION_MAX,
  MAX_BULK_IDS,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  PASSWORD_MIN_LENGTH,
  VEHICLE_TITLE_MAX,
} from "./constants.js";

// ─── primitives ──────────────────────────────────────────────────────────────

export const idSchema = z.string().min(1).max(64);
export const cursorSchema = z.string().min(1).max(512).optional();
export const limitSchema = z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT);

export const moneyCentsSchema = z.coerce.number().int().min(0).max(1_000_000_000_00);
export const yearSchema = z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2);
export const mileageSchema = z.coerce.number().int().min(0).max(2_000_000);

const nullableString = z.string().trim().max(200).nullish();

// ─── auth ────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  name: z.string().trim().min(1).max(120),
  orgName: z.string().trim().min(2).max(120),
  vertical: z.enum(VERTICALS).default("AUTOMOTIVE"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── orgs / members / invites ────────────────────────────────────────────────

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().max(64).optional(),
  vertical: z.enum(VERTICALS).optional(),
  settings: z
    .object({
      dealerContact: z.string().trim().max(200).optional(),
      descriptionFooter: z.string().trim().max(500).optional(),
      defaultTemplateId: z.string().max(64).nullish(),
      soldDetectionEnabled: z.boolean().optional(),
      priceChangeAlertsEnabled: z.boolean().optional(),
    })
    .partial()
    .optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(["ORG_OWNER", "ORG_MANAGER", "SALESPERSON"]).optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["ORG_MANAGER", "SALESPERSON"]).default("SALESPERSON"),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(16).max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// ─── vehicles ────────────────────────────────────────────────────────────────

export const vehicleBaseSchema = z.object({
  vin: z.string().trim().max(17).nullish(),
  stockNumber: z.string().trim().max(40).nullish(),
  year: yearSchema.nullish(),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  trim: nullableString,
  bodyStyle: z.enum(BODY_STYLES).nullish(),
  fuelType: z.enum(FUEL_TYPES).nullish(),
  transmission: z.enum(TRANSMISSIONS).nullish(),
  drivetrain: z.enum(DRIVETRAINS).nullish(),
  mileage: mileageSchema.nullish(),
  priceCents: moneyCentsSchema,
  currency: z.string().trim().length(3).default("USD"),
  condition: z.enum(VEHICLE_CONDITIONS).default("USED"),
  exteriorColor: nullableString,
  interiorColor: nullableString,
  description: z.string().max(DESCRIPTION_MAX).nullish(),
  photoUrls: z.array(z.string().url().max(2048)).max(40).default([]),
});

export const createVehicleSchema = vehicleBaseSchema;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = vehicleBaseSchema.partial();
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const vehicleQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  make: z.string().trim().max(60).optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  hasLiveListing: z.coerce.boolean().optional(),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type VehicleQuery = z.infer<typeof vehicleQuerySchema>;

export const bulkVehicleActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate-descriptions"), vehicleIds: z.array(idSchema).min(1).max(MAX_BULK_IDS) }),
  z.object({
    action: z.literal("queue-listings"),
    vehicleIds: z.array(idSchema).min(1).max(MAX_BULK_IDS),
    channel: z.enum(LISTING_CHANNELS).default("MARKETPLACE"),
    assigneeId: idSchema.nullish(),
  }),
  z.object({ action: z.literal("mark-sold"), vehicleIds: z.array(idSchema).min(1).max(MAX_BULK_IDS) }),
  z.object({ action: z.literal("archive"), vehicleIds: z.array(idSchema).min(1).max(MAX_BULK_IDS) }),
]);
export type BulkVehicleAction = z.infer<typeof bulkVehicleActionSchema>;

// ─── imports ─────────────────────────────────────────────────────────────────

export const csvVehicleRowSchema = vehicleBaseSchema.extend({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
});
export type CsvVehicleRow = z.infer<typeof csvVehicleRowSchema>;

export const jsonFeedItemSchema = vehicleBaseSchema.partial({
  priceCents: true,
}).extend({
  externalId: z.string().trim().max(120).nullish(),
  priceCents: moneyCentsSchema.optional(),
  price: z.coerce.number().min(0).max(1_000_000_000).optional(),
  photos: z.array(z.string().url().max(2048)).max(40).optional(),
});
export type JsonFeedItem = z.infer<typeof jsonFeedItemSchema>;

export const createImportSourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(IMPORT_SOURCE_TYPES),
  scheduleMinutes: z.coerce.number().int().min(0).max(24 * 60).default(0),
  config: z
    .object({
      feedUrl: z.string().url().max(2048).optional(),
      feedAuthHeader: z.string().max(500).optional(),
      webhookSecret: z.string().max(200).optional(),
      fieldMap: z.record(z.string()).optional(),
    })
    .partial()
    .default({}),
});
export type CreateImportSourceInput = z.infer<typeof createImportSourceSchema>;

export const updateImportSourceSchema = createImportSourceSchema.partial();
export type UpdateImportSourceInput = z.infer<typeof updateImportSourceSchema>;

// ─── listings ────────────────────────────────────────────────────────────────

export const createListingSchema = z.object({
  vehicleId: idSchema,
  channel: z.enum(LISTING_CHANNELS).default("MARKETPLACE"),
  assigneeId: idSchema.nullish(),
  title: z.string().trim().min(1).max(VEHICLE_TITLE_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = z.object({
  title: z.string().trim().min(1).max(VEHICLE_TITLE_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  assigneeId: idSchema.nullish(),
});
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const listingTransitionSchema = z.object({
  to: z.enum(LISTING_STATUSES),
  note: z.string().trim().max(500).optional(),
  externalUrl: z.string().url().max(2048).optional(),
  failureReason: z.string().trim().max(500).optional(),
});
export type ListingTransitionInput = z.infer<typeof listingTransitionSchema>;

export const listingQuerySchema = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  channel: z.enum(LISTING_CHANNELS).optional(),
  assigneeId: idSchema.optional(),
  vehicleId: idSchema.optional(),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type ListingQuery = z.infer<typeof listingQuerySchema>;

// ─── descriptions / templates ────────────────────────────────────────────────

export const generateDescriptionSchema = z.object({
  templateId: idSchema.nullish(),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  highlights: z.array(z.string().trim().max(120)).max(20).optional(),
  persist: z.boolean().default(true),
});
export type GenerateDescriptionInput = z.infer<typeof generateDescriptionSchema>;

export const descriptionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  body: z.string().min(1).max(DESCRIPTION_MAX),
  isDefault: z.boolean().default(false),
});
export type DescriptionTemplateInput = z.infer<typeof descriptionTemplateSchema>;

// ─── notifications / analytics ───────────────────────────────────────────────

export const notificationQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// ─── extension tokens ────────────────────────────────────────────────────────

export const createExtensionTokenSchema = z.object({
  label: z.string().trim().min(1).max(80),
});
export type CreateExtensionTokenInput = z.infer<typeof createExtensionTokenSchema>;

// ─── misc ────────────────────────────────────────────────────────────────────

export const rolesEnumSchema = z.enum(ROLES);
export const vehicleStatusEnumSchema = z.enum(VEHICLE_STATUSES);

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
