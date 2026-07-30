import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["OWNER", "MANAGER", "SALESPERSON", "VIEWER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INVITED", "SUSPENDED"]);
export const sourceStatusEnum = pgEnum("source_status", ["HEALTHY", "DEGRADED", "FAILING", "PAUSED"]);
export const syncStatusEnum = pgEnum("sync_status", ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["AVAILABLE", "STALE", "SOLD", "ARCHIVED"]);
export const mediaStatusEnum = pgEnum("media_status", ["READY", "FAILED", "BLOCKED"]);
export const listingStatusEnum = pgEnum("listing_status", [
  "DRAFT",
  "PREPARED",
  "PUBLISHED",
  "REMOVAL_REQUIRED",
  "REMOVED",
  "FAILED",
]);
export const notificationStatusEnum = pgEnum("notification_status", ["UNREAD", "READ", "ARCHIVED"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["PENDING", "PROCESSING", "DELIVERED", "FAILED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").default("America/Chicago").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("organizations_slug_uq").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    status: userStatusEnum("status").default("ACTIVE").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_uq").on(sql`lower(${table.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("memberships_org_user_uq").on(table.organizationId, table.userId),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("sessions_token_uq").on(table.tokenHash), index("sessions_user_idx").on(table.userId)],
);

export const inventorySources = pgTable(
  "inventory_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    status: sourceStatusEnum("status").default("HEALTHY").notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("inventory_sources_org_idx").on(table.organizationId)],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => inventorySources.id, { onDelete: "cascade" }),
    status: syncStatusEnum("status").default("RUNNING").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    counts: jsonb("counts").$type<Record<string, number>>().default({}).notNull(),
    error: text("error"),
    checksum: text("checksum"),
  },
  (table) => [index("sync_runs_source_started_idx").on(table.sourceId, table.startedAt)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => inventorySources.id, { onDelete: "set null" }),
    vin: text("vin"),
    stockNumber: text("stock_number"),
    year: integer("year").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    mileage: integer("mileage"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    status: vehicleStatusEnum("status").default("AVAILABLE").notNull(),
    exteriorColor: text("exterior_color"),
    transmission: text("transmission"),
    fuelType: text("fuel_type"),
    bodyStyle: text("body_style"),
    facts: jsonb("facts").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicles_org_vin_uq").on(table.organizationId, table.vin).where(sql`${table.vin} is not null`),
    uniqueIndex("vehicles_org_stock_uq")
      .on(table.organizationId, table.stockNumber)
      .where(sql`${table.stockNumber} is not null`),
    index("vehicles_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const vehicleMedia = pgTable(
  "vehicle_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull(),
    checksum: text("checksum"),
    status: mediaStatusEnum("status").default("READY").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("vehicle_media_position_uq").on(table.vehicleId, table.position)],
);

export const vehicleChanges = pgTable(
  "vehicle_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("vehicle_changes_vehicle_idx").on(table.vehicleId, table.createdAt)],
);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    channel: text("channel").default("FACEBOOK_MARKETPLACE").notNull(),
    externalAccountKey: text("external_account_key").default("default").notNull(),
    status: listingStatusEnum("status").default("DRAFT").notNull(),
    title: text("title").notNull(),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    externalUrl: text("external_url"),
    failureReason: text("failure_reason"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("listings_org_status_idx").on(table.organizationId, table.status),
    uniqueIndex("listings_active_vehicle_channel_uq")
      .on(table.vehicleId, table.channel, table.externalAccountKey)
      .where(sql`${table.status} in ('DRAFT', 'PREPARED', 'PUBLISHED', 'REMOVAL_REQUIRED')`),
  ],
);

export const listingEvents = pgTable(
  "listing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("listing_events_listing_idx").on(table.listingId, table.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: notificationStatusEnum("status").default("UNREAD").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [index("notifications_org_user_idx").on(table.organizationId, table.userId, table.status)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    requestId: text("request_id").notNull(),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: outboxStatusEnum("status").default("PENDING").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outbox_idempotency_uq").on(table.idempotencyKey),
    index("outbox_status_available_idx").on(table.status, table.availableAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  },
);
