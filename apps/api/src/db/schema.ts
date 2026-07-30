import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    phone: text("phone"),
    website: text("website"),
    addressLine: text("address_line"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    /** Org-level preferences: description tone, disclaimer, staleness threshold, etc. */
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["OWNER", "MANAGER", "SALESPERSON"] }).notNull().default("SALESPERSON"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_memberships_org_user_unique").on(t.orgId, t.userId),
    index("org_memberships_user_idx").on(t.userId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["OWNER", "MANAGER", "SALESPERSON"] }).notNull().default("SALESPERSON"),
    token: text("token").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_token_unique").on(t.token), index("invites_org_idx").on(t.orgId)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    client: text("client").notNull().default("web"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("refresh_tokens_hash_unique").on(t.tokenHash), index("refresh_tokens_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    vin: text("vin").notNull(),
    stockNumber: text("stock_number"),
    year: integer("year").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    bodyStyle: text("body_style"),
    condition: text("condition").notNull().default("USED"),
    mileage: integer("mileage"),
    priceCents: integer("price_cents"),
    exteriorColor: text("exterior_color"),
    interiorColor: text("interior_color"),
    transmission: text("transmission"),
    fuelType: text("fuel_type"),
    drivetrain: text("drivetrain"),
    engine: text("engine"),
    doors: integer("doors"),
    description: text("description"),
    descriptionSource: text("description_source"),
    features: jsonb("features").notNull().default(sql`'[]'::jsonb`),
    photoUrls: jsonb("photo_urls").notNull().default(sql`'[]'::jsonb`),
    status: text("status", { enum: ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"] }).notNull().default("AVAILABLE"),
    source: text("source").notNull().default("MANUAL"),
    feedSourceId: uuid("feed_source_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    soldDetectedAt: timestamp("sold_detected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicles_org_vin_unique").on(t.orgId, t.vin),
    index("vehicles_org_status_idx").on(t.orgId, t.status),
    index("vehicles_org_make_idx").on(t.orgId, t.make),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents"),
    source: text("source").notNull().default("SYNC"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_vehicle_idx").on(t.vehicleId)],
);

export const feedSources = pgTable(
  "feed_sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["CSV_URL", "JSON_URL"] }).notNull(),
    url: text("url").notNull(),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    markMissingAsSold: boolean("mark_missing_as_sold").notNull().default(true),
    active: boolean("active").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feed_sources_org_idx").on(t.orgId)],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    feedSourceId: uuid("feed_source_id").references(() => feedSources.id, { onDelete: "set null" }),
    trigger: text("trigger", { enum: ["MANUAL", "SCHEDULED", "CSV"] }).notNull(),
    status: text("status", { enum: ["RUNNING", "SUCCEEDED", "FAILED"] }).notNull().default("RUNNING"),
    stats: jsonb("stats").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("sync_runs_org_idx").on(t.orgId)],
);

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("FACEBOOK_MARKETPLACE"),
    status: text("status", { enum: ["DRAFT", "PREPARED", "ACTIVE", "ENDED", "REMOVED", "FAILED"] })
      .notNull()
      .default("DRAFT"),
    remoteUrl: text("remote_url"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listings_org_idx").on(t.orgId),
    index("listings_vehicle_idx").on(t.vehicleId),
    index("listings_user_idx").on(t.userId),
    index("listings_org_status_idx").on(t.orgId, t.status),
  ],
);

export const listingEvents = pgTable(
  "listing_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    message: text("message"),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_events_listing_idx").on(t.listingId)],
);

/* ------------------------------------------------------------------ */
/* Notifications, audit, jobs                                          */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_org_idx").on(t.orgId, t.createdAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: text("status", { enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"] })
      .notNull()
      .default("PENDING"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_run_at_idx").on(t.status, t.runAt), index("jobs_dedupe_idx").on(t.dedupeKey)],
);
