import { z } from 'zod';

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALESPERSON: 'SALESPERSON',
} as const;

export type RoleType = (typeof Role)[keyof typeof Role];

export const ROLE_HIERARCHY: Record<RoleType, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  SALESPERSON: 1,
};

export function hasMinRole(userRole: RoleType, requiredRole: RoleType): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isFacebookMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFacebookHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    return (
      url.protocol === 'https:' &&
      isFacebookHost &&
      /^\/marketplace\/item\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export const VehicleStatus = {
  AVAILABLE: 'AVAILABLE',
  PENDING: 'PENDING',
  SOLD: 'SOLD',
  ARCHIVED: 'ARCHIVED',
} as const;

export type VehicleStatusType = (typeof VehicleStatus)[keyof typeof VehicleStatus];

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  organizationName: z.string().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  description: z.string().max(10000).optional().nullable(),
  features: z.array(z.string()).optional(),
  status: z.enum(['AVAILABLE', 'PENDING', 'SOLD', 'ARCHIVED']).optional(),
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
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        sortOrder: z.number().int().optional(),
        isPrimary: z.boolean().optional(),
      })
    )
    .optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'PENDING', 'SOLD', 'ARCHIVED']).optional(),
  assignedToId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Listing schemas
export const createListingSchema = z.object({
  vehicleId: z.string(),
  platform: z.string().default('facebook_marketplace'),
  externalUrl: z.string().url().optional().nullable(),
  externalId: z.string().optional().nullable(),
  priceAtListing: z.coerce.number().finite().nonnegative().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateListingSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'SOLD', 'REMOVED', 'STALE']).optional(),
  externalUrl: z.string().url().optional().nullable(),
  removedAt: z.string().datetime().optional().nullable(),
});

// Extension event schema
export const extensionEventSchema = z.object({
  eventType: z.enum([
    'listing_created',
    'listing_removed',
    'form_filled',
    'listing_error',
  ]),
  vehicleId: z.string(),
  listingId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Invite schema
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'SALESPERSON']),
  password: z.string().min(8).max(128),
});

export const updateMemberSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'SALESPERSON']).optional(),
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
});

// API key schema
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// Bulk update schema
export const bulkUpdateVehiclesSchema = z.object({
  vehicleIds: z.array(z.string()).min(1).max(100),
  status: z.enum(['AVAILABLE', 'PENDING', 'SOLD', 'ARCHIVED']).optional(),
  assignedToId: z.string().optional().nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type ExtensionEventInput = z.infer<typeof extensionEventSchema>;

// Sync source schemas
export const createSyncSourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  adapter: z.enum(['generic', 'dealer-json', 'json-ld', 'd2c']).default('generic'),
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

export type CreateSyncSourceInput = z.infer<typeof createSyncSourceSchema>;
export type UpdateSyncSourceInput = z.infer<typeof updateSyncSourceSchema>;

export * from './description';
export * from './vin';
export * from './sync';
