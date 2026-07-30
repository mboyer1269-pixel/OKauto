import { z } from 'zod';

export const ROLES = ['owner', 'admin', 'manager', 'salesperson', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_TYPES = [
  'automotive',
  'rv',
  'marine',
  'powersports',
  'commercial',
  'other',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = [
  'available',
  'pending',
  'listed',
  'sold',
  'archived',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const LISTING_STATUSES = [
  'draft',
  'prepared',
  'filled',
  'submitted',
  'active',
  'removed',
  'sold',
  'failed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const SOURCE_TYPES = ['csv', 'xml', 'website', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const PLATFORM = 'facebook_marketplace' as const;

export const roleSchema = z.enum(ROLES);
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);
export const vehicleStatusSchema = z.enum(VEHICLE_STATUSES);
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  organizationName: z.string().min(2).max(160),
  dealershipName: z.string().min(2).max(160).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const createVehicleSchema = z.object({
  dealershipId: z.string().uuid(),
  vin: z.string().min(5).max(32).optional(),
  stockNumber: z.string().max(64).optional(),
  vehicleType: vehicleTypeSchema.default('automotive'),
  year: z.number().int().min(1900).max(2100).optional(),
  make: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  trim: z.string().max(120).optional(),
  bodyStyle: z.string().max(80).optional(),
  exteriorColor: z.string().max(80).optional(),
  interiorColor: z.string().max(80).optional(),
  mileage: z.number().int().min(0).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  description: z.string().max(10000).optional(),
  status: vehicleStatusSchema.default('available'),
  attributes: z.record(z.unknown()).optional(),
  photoUrls: z.array(z.string().url()).max(50).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial().omit({ dealershipId: true });

export const vehicleFilterSchema = z.object({
  dealershipId: z.string().uuid().optional(),
  status: vehicleStatusSchema.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const prepareListingSchema = z.object({
  regenerateDescription: z.boolean().optional(),
  titleOverride: z.string().max(200).optional(),
  priceOverride: z.number().min(0).optional(),
  descriptionOverride: z.string().max(10000).optional(),
});

export const listingEventSchema = z.object({
  type: z.enum([
    'prepared',
    'filled',
    'submitted',
    'removed',
    'sold_detected',
    'price_changed',
    'failed',
    'acknowledged',
  ]),
  meta: z.record(z.unknown()).optional(),
  externalListingId: z.string().max(200).optional(),
  externalUrl: z.string().url().optional(),
});

export const createInventorySourceSchema = z.object({
  dealershipId: z.string().uuid(),
  name: z.string().min(1).max(120),
  type: sourceTypeSchema,
  config: z
    .object({
      url: z.string().url().optional(),
      mapping: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
    })
    .default({}),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: roleSchema,
  dealershipId: z.string().uuid().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type PrepareListingInput = z.infer<typeof prepareListingSchema>;
export type ListingEventInput = z.infer<typeof listingEventSchema>;

/** Marketplace listing payload shared by API and extension */
export const marketplaceListingPayloadSchema = z.object({
  listingId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  title: z.string(),
  price: z.number().nullable(),
  currency: z.string(),
  description: z.string(),
  condition: z.string().default('Used'),
  vehicleType: vehicleTypeSchema,
  year: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  mileage: z.number().nullable(),
  vin: z.string().nullable(),
  exteriorColor: z.string().nullable(),
  photos: z.array(
    z.object({
      url: z.string(),
      sortOrder: z.number(),
    }),
  ),
  locationHint: z.string().nullable().optional(),
  policyNotice:
    z.string().default(
      'OKauto assists listing creation. You must review and submit manually. Never bypass CAPTCHA or platform protections.',
    ),
});

export type MarketplaceListingPayload = z.infer<typeof marketplaceListingPayloadSchema>;

export function buildVehicleTitle(v: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ').trim() || 'Vehicle';
}

export function templateDescription(v: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  exteriorColor?: string | null;
  stockNumber?: string | null;
  vin?: string | null;
  description?: string | null;
}): string {
  const title = buildVehicleTitle(v);
  const lines = [
    `${title} — ready for viewing.`,
    v.mileage != null ? `Mileage: ${v.mileage.toLocaleString()} miles.` : null,
    v.exteriorColor ? `Exterior: ${v.exteriorColor}.` : null,
    v.price != null ? `Asking price: $${v.price.toLocaleString()}.` : null,
    v.stockNumber ? `Stock #${v.stockNumber}.` : null,
    v.vin ? `VIN: ${v.vin}.` : null,
    '',
    v.description?.trim() ||
      'Clean, well-maintained unit from our dealership inventory. Message us to schedule a test drive or request more photos.',
    '',
    'Financing options may be available. Trade-ins welcome. Call or message for details.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export const ROLE_RANK: Record<Role, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  salesperson: 40,
  viewer: 20,
};

export function hasMinRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
