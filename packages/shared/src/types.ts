/**
 * Core domain types shared across the API, dashboard, and extension.
 * These are framework-agnostic and mirror (but do not import) the Prisma models.
 */

export const ROLES = [
  'SUPERADMIN',
  'OWNER',
  'ADMIN',
  'MANAGER',
  'SALESPERSON',
  'VIEWER',
] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_CATEGORIES = [
  'AUTOMOTIVE',
  'RV_TRAILER',
  'MARINE_POWERSPORTS',
  'MOBILE_HOME',
  'REAL_ESTATE',
  'FARM_EQUIPMENT',
  'FURNITURE',
  'OTHER',
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const VEHICLE_STATUSES = [
  'DRAFT',
  'AVAILABLE',
  'PENDING_SALE',
  'SOLD',
  'ARCHIVED',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const LISTING_STATUSES = [
  'DRAFT',
  'READY',
  'PENDING',
  'ACTIVE',
  'NEEDS_ATTENTION',
  'REMOVED',
  'SOLD',
  'FAILED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_CHANNELS = ['FACEBOOK_MARKETPLACE', 'OTHER'] as const;
export type ListingChannel = (typeof LISTING_CHANNELS)[number];

export const LISTING_EVENT_TYPES = [
  'CREATED',
  'PREFILLED',
  'SUBMITTED',
  'ACTIVATED',
  'PRICE_CHANGED',
  'SOLD_DETECTED',
  'TAKEDOWN_REQUESTED',
  'REMOVED',
  'FAILED',
  'NOTE',
] as const;
export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'SOLD_ALERT',
  'PRICE_CHANGE',
  'LISTING_NEEDS_ATTENTION',
  'IMPORT_COMPLETE',
  'INVITE',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FUEL_TYPES = [
  'GASOLINE',
  'DIESEL',
  'ELECTRIC',
  'HYBRID',
  'PLUGIN_HYBRID',
  'FLEX',
  'OTHER',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ['AUTOMATIC', 'MANUAL', 'CVT', 'OTHER'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

/** A normalized vehicle used for listing generation and mapping. */
export interface NormalizedVehicle {
  vin: string | null;
  stockNumber: string | null;
  category: VehicleCategory;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyStyle: string | null;
  mileage: number | null;
  priceCents: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  fuelType: FuelType | null;
  transmission: Transmission | null;
  drivetrain: string | null;
  engine: string | null;
  features: string[];
  condition: string | null;
  title: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = { data: T } | { error: ApiError };
