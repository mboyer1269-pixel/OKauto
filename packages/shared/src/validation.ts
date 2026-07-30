/**
 * Zod schemas used at API boundaries and for import validation.
 */
import { z } from 'zod';
import {
  LISTING_STATUSES,
  ROLES,
  VEHICLE_CATEGORIES,
  VEHICLE_STATUSES,
} from './types.js';

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(1).max(160),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES).refine((r) => r !== 'SUPERADMIN', 'Cannot invite SUPERADMIN'),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1).max(120).optional(),
  password: passwordSchema.optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(ROLES).refine((r) => r !== 'SUPERADMIN', 'Cannot assign SUPERADMIN'),
});

export const vehicleInputSchema = z.object({
  vin: z.string().trim().max(17).optional().nullable(),
  stockNumber: z.string().trim().max(64).optional().nullable(),
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  year: z.union([z.number(), z.string()]).optional().nullable(),
  make: z.string().trim().max(64).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  trim: z.string().trim().max(80).optional().nullable(),
  bodyStyle: z.string().trim().max(64).optional().nullable(),
  mileage: z.union([z.number(), z.string()]).optional().nullable(),
  price: z.union([z.number(), z.string()]).optional().nullable(),
  exteriorColor: z.string().trim().max(48).optional().nullable(),
  interiorColor: z.string().trim().max(48).optional().nullable(),
  fuelType: z.string().trim().max(32).optional().nullable(),
  transmission: z.string().trim().max(32).optional().nullable(),
  drivetrain: z.string().trim().max(16).optional().nullable(),
  engine: z.string().trim().max(64).optional().nullable(),
  features: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  condition: z.string().trim().max(48).optional().nullable(),
  photoUrls: z.array(z.string().url()).max(30).optional(),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const updateVehicleSchema = vehicleInputSchema.partial().extend({
  status: z.enum(VEHICLE_STATUSES).optional(),
});

export const importSchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  content: z.string().min(1),
});

export const descriptionRequestSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'concise', 'enthusiastic']).optional(),
  includePrice: z.boolean().optional(),
  includeCallToAction: z.boolean().optional(),
  maxLength: z.number().int().min(80).max(5000).optional(),
});

export const createListingSchema = z.object({
  vehicleId: z.string().min(1),
  channel: z.enum(['FACEBOOK_MARKETPLACE', 'OTHER']).default('FACEBOOK_MARKETPLACE'),
  description: z.string().max(9000).optional(),
});

export const updateListingStatusSchema = z.object({
  status: z.enum(LISTING_STATUSES),
  externalUrl: z.string().url().optional(),
  note: z.string().max(500).optional(),
});

export const repriceSchema = z.object({
  price: z.union([z.number(), z.string()]),
});

export const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export function formatZodError(error: z.ZodError): { code: string; message: string; details: unknown } {
  return {
    code: 'validation_error',
    message: 'Request validation failed',
    details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
