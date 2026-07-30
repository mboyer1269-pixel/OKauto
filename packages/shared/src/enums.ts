export const ROLES = ["PLATFORM_ADMIN", "ORG_OWNER", "ORG_MANAGER", "SALESPERSON"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = ["ACTIVE", "INVITED", "DEACTIVATED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const VEHICLE_STATUSES = [
  "INGESTED",
  "ACTIVE",
  "PRICE_CHANGED",
  "SUSPECTED_SOLD",
  "SOLD",
  "ARCHIVED",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CONDITIONS = ["NEW", "USED", "CERTIFIED_PRE_OWNED"] as const;
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];

export const BODY_STYLES = [
  "SEDAN",
  "SUV",
  "TRUCK",
  "COUPE",
  "HATCHBACK",
  "WAGON",
  "VAN",
  "MINIVAN",
  "CONVERTIBLE",
  "RV",
  "TRAILER",
  "OTHER",
] as const;
export type BodyStyle = (typeof BODY_STYLES)[number];

export const FUEL_TYPES = ["GASOLINE", "DIESEL", "HYBRID", "PLUGIN_HYBRID", "ELECTRIC", "FLEX_FUEL", "OTHER"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["AUTOMATIC", "MANUAL", "CVT", "OTHER"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const DRIVETRAINS = ["FWD", "RWD", "AWD", "FOUR_WD", "OTHER"] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];

export const LISTING_STATUSES = [
  "DRAFT",
  "READY",
  "QUEUED",
  "ASSIGNED",
  "IN_PROGRESS",
  "LIVE",
  "ATTENTION",
  "NEEDS_REMOVAL",
  "REMOVED",
  "ENDED",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Statuses in which a listing still occupies its (vehicle, channel) slot. */
export const NON_TERMINAL_LISTING_STATUSES = [
  "DRAFT",
  "READY",
  "QUEUED",
  "ASSIGNED",
  "IN_PROGRESS",
  "LIVE",
  "ATTENTION",
  "NEEDS_REMOVAL",
] as const satisfies readonly ListingStatus[];

export const TERMINAL_LISTING_STATUSES = ["REMOVED", "ENDED"] as const satisfies readonly ListingStatus[];

export const LISTING_CHANNELS = ["MARKETPLACE", "GROUPS"] as const;
export type ListingChannel = (typeof LISTING_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  "SOLD_SUSPECTED",
  "SOLD_CONFIRMED",
  "PRICE_CHANGED",
  "LISTING_LIVE",
  "LISTING_ATTENTION",
  "IMPORT_COMPLETED",
  "IMPORT_FAILED",
  "SYNC_HEALTH",
  "MEMBER_JOINED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const IMPORT_SOURCE_TYPES = ["CSV", "JSON_FEED", "WEBHOOK", "MANUAL"] as const;
export type ImportSourceType = (typeof IMPORT_SOURCE_TYPES)[number];

export const IMPORT_RUN_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "PARTIAL"] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export const JOB_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = [
  "IMPORT_RUN",
  "SYNC_SWEEP",
  "GENERATE_DESCRIPTION",
  "NOTIFICATION_DIGEST",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const VERTICALS = [
  "AUTOMOTIVE",
  "RV_TRAILERS",
  "MARINE_POWERSPORTS",
  "MOBILE_HOMES",
  "REAL_ESTATE",
  "FARM_EQUIPMENT",
  "FURNITURE",
  "OTHER",
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const ACTOR_TYPES = ["USER", "SYSTEM", "EXTENSION", "WEBHOOK"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
