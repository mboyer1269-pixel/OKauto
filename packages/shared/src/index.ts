import { z } from "zod";

export const RoleSchema = z.enum(["owner", "manager", "salesperson", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;

export const VehicleStatusSchema = z.enum([
  "available",
  "pending",
  "listed",
  "sold",
  "archived",
]);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const ListingStatusSchema = z.enum([
  "draft",
  "ready",
  "posted",
  "needs_removal",
  "removed",
  "failed",
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const ListingChannelSchema = z.enum(["marketplace", "group"]);
export type ListingChannel = z.infer<typeof ListingChannelSchema>;

export const InventorySourceTypeSchema = z.enum(["csv", "feed", "manual"]);
export type InventorySourceType = z.infer<typeof InventorySourceTypeSchema>;

/** Permissions matrix — safest scalable RBAC. */
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  owner: [
    "org:read",
    "org:write",
    "org:delete",
    "members:read",
    "members:write",
    "inventory:read",
    "inventory:write",
    "listings:read",
    "listings:write",
    "analytics:read",
    "notifications:read",
    "audit:read",
    "settings:write",
  ],
  manager: [
    "org:read",
    "org:write",
    "members:read",
    "members:write",
    "inventory:read",
    "inventory:write",
    "listings:read",
    "listings:write",
    "analytics:read",
    "notifications:read",
    "audit:read",
    "settings:write",
  ],
  salesperson: [
    "org:read",
    "members:read",
    "inventory:read",
    "listings:read",
    "listings:write",
    "analytics:read",
    "notifications:read",
  ],
  viewer: [
    "org:read",
    "members:read",
    "inventory:read",
    "listings:read",
    "analytics:read",
    "notifications:read",
  ],
} as const;

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  organizationName: z.string().min(2).max(160),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const InviteSchema = z.object({
  email: z.string().email(),
  role: RoleSchema.exclude(["owner"]),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

export const VehicleCreateSchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i, "Invalid VIN")
    .optional()
    .nullable(),
  stockNumber: z.string().trim().max(64).optional().nullable(),
  year: z.number().int().min(1900).max(2100),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  trim: z.string().max(80).optional().nullable(),
  priceCents: z.number().int().min(0),
  mileage: z.number().int().min(0).optional().nullable(),
  bodyStyle: z.string().max(80).optional().nullable(),
  exteriorColor: z.string().max(80).optional().nullable(),
  interiorColor: z.string().max(80).optional().nullable(),
  transmission: z.string().max(80).optional().nullable(),
  fuelType: z.string().max(80).optional().nullable(),
  drivetrain: z.string().max(80).optional().nullable(),
  description: z.string().max(10000).optional().nullable(),
  photoUrls: z.array(z.string().url()).max(50).default([]),
  attributes: z.record(z.unknown()).optional(),
  status: VehicleStatusSchema.optional(),
});

export const VehicleUpdateSchema = VehicleCreateSchema.partial();

export const ListingCreateSchema = z.object({
  vehicleId: z.string().cuid(),
  channel: ListingChannelSchema.default("marketplace"),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  priceCents: z.number().int().min(0).optional(),
  groupName: z.string().max(200).optional().nullable(),
});

export const DescribeVehicleSchema = z.object({
  tone: z.enum(["professional", "friendly", "urgent"]).default("professional"),
  includeVin: z.boolean().default(false),
  maxLength: z.number().int().min(100).max(5000).default(1200),
});

export const FeedConfigSchema = z.object({
  name: z.string().min(1).max(120),
  feedUrl: z.string().url(),
  intervalMinutes: z.number().int().min(15).max(1440).default(60),
});

export const CsvVehicleRowSchema = z.object({
  vin: z.string().optional(),
  stockNumber: z.string().optional(),
  year: z.coerce.number().int(),
  make: z.string(),
  model: z.string(),
  trim: z.string().optional(),
  price: z.coerce.number(),
  mileage: z.coerce.number().optional(),
  bodyStyle: z.string().optional(),
  exteriorColor: z.string().optional(),
  photoUrls: z.string().optional(),
  description: z.string().optional(),
  status: VehicleStatusSchema.optional(),
});

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const cleaned = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (cleaned.length < 11 || cleaned.length > 17) return null;
  return cleaned;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function vehicleTitle(v: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

export function buildTemplateDescription(
  v: {
    year: number;
    make: string;
    model: string;
    trim?: string | null;
    mileage?: number | null;
    priceCents: number;
    exteriorColor?: string | null;
    transmission?: string | null;
    fuelType?: string | null;
    drivetrain?: string | null;
    stockNumber?: string | null;
    vin?: string | null;
  },
  options: { includeVin?: boolean; tone?: string } = {},
): string {
  const title = vehicleTitle(v);
  const price = `$${(v.priceCents / 100).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
  const miles =
    v.mileage != null ? `${v.mileage.toLocaleString("en-US")} miles` : null;
  const bits = [
    options.tone === "urgent"
      ? `Don't miss this ${title}!`
      : options.tone === "friendly"
        ? `Check out this clean ${title}.`
        : `For sale: ${title}.`,
    miles ? `Odometer: ${miles}.` : null,
    v.exteriorColor ? `Exterior: ${v.exteriorColor}.` : null,
    v.transmission ? `Transmission: ${v.transmission}.` : null,
    v.fuelType ? `Fuel: ${v.fuelType}.` : null,
    v.drivetrain ? `Drivetrain: ${v.drivetrain}.` : null,
    `Asking price: ${price}.`,
    v.stockNumber ? `Stock #${v.stockNumber}.` : null,
    options.includeVin && v.vin ? `VIN: ${v.vin}.` : null,
    "Financing available. Call or message for a test drive. Vehicle subject to prior sale.",
  ].filter(Boolean);
  return bits.join(" ");
}

export type ApiErrorBody = {
  error: string;
  code?: string;
  details?: unknown;
  requestId?: string;
};
