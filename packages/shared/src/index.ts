import { z } from "zod";

export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALESPERSON: "SALESPERSON",
} as const;

export type RoleType = (typeof Role)[keyof typeof Role];

export const ROLE_HIERARCHY: Record<RoleType, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  SALESPERSON: 1,
};

export function hasMinRole(
  userRole: RoleType,
  requiredRole: RoleType,
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isFacebookMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFacebookHost =
      hostname === "facebook.com" || hostname.endsWith(".facebook.com");
    return (
      url.protocol === "https:" &&
      isFacebookHost &&
      /^\/marketplace\/item\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export const VehicleStatus = {
  AVAILABLE: "AVAILABLE",
  PENDING: "PENDING",
  SOLD: "SOLD",
  ARCHIVED: "ARCHIVED",
} as const;

export type VehicleStatusType =
  (typeof VehicleStatus)[keyof typeof VehicleStatus];

// Auth schemas
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  organizationName: z.string().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().max(200).optional(),
});

export const createAccessRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dealership: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value ? value : undefined)),
  message: z.string().trim().min(1).max(2000),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "Le consentement est requis pour envoyer la demande.",
    }),
  }),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Vehicle schemas
export const createVehicleSchema = z.object({
  vin: z.string().max(17).optional().nullable(),
  stockNumber: z.string().max(50).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  make: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  trim: z.string().max(100).optional().nullable(),
  bodyStyle: z.string().max(50).optional().nullable(),
  exteriorColor: z.string().max(50).optional().nullable(),
  interiorColor: z.string().max(50).optional().nullable(),
  mileage: z.number().int().min(0).optional().nullable(),
  price: z.number().min(0).optional().nullable(),
  msrp: z.number().min(0).optional().nullable(),
  freightFee: z.number().min(0).max(50000).optional().nullable(),
  pdiFee: z.number().min(0).max(50000).optional().nullable(),
  adminFee: z.number().min(0).max(50000).optional().nullable(),
  acExciseFee: z.number().min(0).max(5000).optional().nullable(),
  descriptionEn: z.string().max(10000).optional().nullable(),
  description: z.string().max(10000).optional().nullable(),
  features: z.array(z.string()).optional(),
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"]).optional(),
  fuelType: z.string().max(50).optional().nullable(),
  transmission: z.string().max(50).optional().nullable(),
  drivetrain: z.string().max(50).optional().nullable(),
  engine: z.string().max(100).optional().nullable(),
  doors: z.number().int().optional().nullable(),
  cylinders: z.number().int().optional().nullable(),
  condition: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  includeCarfaxSourceUrl: z.boolean().optional(),
  vinDecoded: z.boolean().optional(),
  vinDecodedFields: z.array(z.string()).optional(),
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        sortOrder: z.number().int().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleQuerySchema = z.object({
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"]).optional(),
  scope: z.enum(["on_sale", "sold"]).optional(),
  assignedToId: z.string().optional(),
  search: z.string().optional(),
  inventoryType: z.enum(["NEW", "USED", "DEMO"]).optional(),
  view: z.enum(["full", "summary"]).default("full"),
  withoutActiveListing: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Listing schemas
export const createListingSchema = z.object({
  vehicleId: z.string(),
  platform: z.string().default("facebook_marketplace"),
  externalUrl: z.string().url().optional().nullable(),
  externalId: z.string().optional().nullable(),
  priceAtListing: z.coerce
    .number()
    .finite()
    .nonnegative()
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateListingSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "SOLD", "REMOVED", "STALE"]).optional(),
  externalUrl: z.string().url().optional().nullable(),
  removedAt: z.string().datetime().optional().nullable(),
  renew: z.boolean().optional(),
});

export const confirmListingPriceSchema = z.object({
  price: z.number().finite().nonnegative(),
});

export const updateVehiclePrioritySchema = z.object({
  managerPriority: z.boolean(),
  note: z.string().max(240).optional().nullable(),
});

const highlightPairSchema = z.object({
  fr: z.string().max(600).optional(),
  en: z.string().max(600).optional(),
});

export const updateMarketplaceDraftSchema = z.object({
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(80).max(8000),
  locale: z.enum(["fr", "en", "bilingual"]).optional(),
  titleEn: z.string().trim().min(5).max(100).optional().nullable(),
  descriptionEn: z.string().trim().min(80).max(5000).optional().nullable(),
  photoOrder: z.array(z.string().url()).max(20).optional(),
});

// Extension event schema
export const extensionEventSchema = z.object({
  eventType: z.enum([
    "listing_created",
    "listing_removed",
    "form_filled",
    "listing_error",
  ]),
  vehicleId: z.string(),
  listingId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Invite schema
export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["ADMIN", "MANAGER", "SALESPERSON"]),
});

export const acceptInviteSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  name: z.string().min(1).max(100).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SALESPERSON"]).optional(),
  password: z.string().min(8).max(128).optional(),
  marketplaceMonthlyVehicleLimit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullable()
    .optional(),
});

// Organization schema
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().url().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  monthlyListingLimit: z.number().int().min(1).max(50).optional(),
  marketplaceMonthlyVehicleLimit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullable()
    .optional(),
  listingRenewalDays: z.number().int().min(3).max(90).optional(),
  listingLocale: z.enum(["fr", "en", "bilingual"]).optional(),
  listingLanguage: z.enum(["fr", "fr_en"]).optional(),
  listingHighlights: z
    .object({
      NEW: highlightPairSchema.optional(),
      USED: highlightPairSchema.optional(),
      DEMO: highlightPairSchema.optional(),
    })
    .nullable()
    .optional(),
  confirmAllInPrice: z.boolean().optional(),
  freightFee: z.number().min(0).max(50000).optional().nullable(),
  pdiFee: z.number().min(0).max(50000).optional().nullable(),
  adminFee: z.number().min(0).max(50000).optional().nullable(),
  acExciseFee: z.number().min(0).max(5000).optional().nullable(),
  metaCatalogStateForDemo: z.enum(["Used", "New"]).optional(),
  includeCarfaxSourceUrl: z.boolean().optional(),
});

export const decodeVinRequestSchema = z.object({
  vin: z.string().min(1).max(32),
});

// API key schema
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// Bulk update schema
export const bulkUpdateVehiclesSchema = z.object({
  vehicleIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"]).optional(),
  assignedToId: z.string().optional().nullable(),
});

export const confirmFeedAbsenceSchema = z.object({
  vehicleIds: z.array(z.string()).min(1).max(200),
  action: z.enum(["sold", "keep"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateMarketplaceDraftInput = z.infer<
  typeof updateMarketplaceDraftSchema
>;
export type ExtensionEventInput = z.infer<typeof extensionEventSchema>;

// Sync source schemas
export const createSyncSourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  adapter: z
    .enum(["generic", "dealer-json", "json-ld", "d2c"])
    .default("generic"),
  isActive: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(10080).default(60),
});

export const updateSyncSourceSchema = createSyncSourceSchema.partial();

export const presignPhotoSchema = z.object({
  vehicleId: z.string(),
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^image\//),
});

export const addPhotoSchema = z.object({
  url: z.string().url(),
  storageKey: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isPrimary: z.boolean().optional(),
});

const optionalEmail = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().email().nullable().optional(),
);

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: optionalEmail,
  message: z.string().trim().max(4000).optional().nullable(),
  source: z
    .enum(["MARKETPLACE", "PHONE", "WALK_IN", "OTHER"])
    .default("MARKETPLACE"),
  vehicleId: z.string().optional().nullable(),
  listingId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
});

export const updateLeadSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: optionalEmail,
  message: z.string().trim().max(4000).optional().nullable(),
  source: z.enum(["MARKETPLACE", "PHONE", "WALK_IN", "OTHER"]).optional(),
  status: z
    .enum(["NEW", "CONTACTED", "APPOINTMENT", "SOLD", "LOST"])
    .optional(),
  vehicleId: z.string().optional().nullable(),
  listingId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
});

export const leadQuerySchema = z.object({
  status: z
    .enum(["NEW", "CONTACTED", "APPOINTMENT", "SOLD", "LOST"])
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSyncSourceInput = z.infer<typeof createSyncSourceSchema>;
export type UpdateSyncSourceInput = z.infer<typeof updateSyncSourceSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export * from "./description";
export * from "./pricing";
export * from "./publish-queue";
export * from "./priority";
export * from "./listing-health";
export * from "./catalog";
export * from "./vin";
export * from "./sync";
export * from "./uptime-ping";
export * from "./sentry-scrub";
export * from "./sync-degraded";
export * from "./job-policy";
export * from "./platform-admin";
export * from "./inventory-scope";
