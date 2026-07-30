CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role AS ENUM ('OWNER', 'MANAGER', 'SALESPERSON', 'VIEWER');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE source_status AS ENUM ('HEALTHY', 'DEGRADED', 'FAILING', 'PAUSED');
CREATE TYPE sync_status AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
CREATE TYPE vehicle_status AS ENUM ('AVAILABLE', 'STALE', 'SOLD', 'ARCHIVED');
CREATE TYPE media_status AS ENUM ('READY', 'FAILED', 'BLOCKED');
CREATE TYPE listing_status AS ENUM ('DRAFT', 'PREPARED', 'PUBLISHED', 'REMOVAL_REQUIRED', 'REMOVED', 'FAILED');
CREATE TYPE notification_status AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE inventory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  url text,
  config jsonb NOT NULL DEFAULT '{}',
  status source_status NOT NULL DEFAULT 'HEALTHY',
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_sources_org_idx ON inventory_sources(organization_id);

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES inventory_sources(id) ON DELETE CASCADE,
  status sync_status NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  counts jsonb NOT NULL DEFAULT '{}',
  error text,
  checksum text
);
CREATE INDEX sync_runs_source_started_idx ON sync_runs(source_id, started_at DESC);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid REFERENCES inventory_sources(id) ON DELETE SET NULL,
  vin text,
  stock_number text,
  year integer NOT NULL CHECK (year BETWEEN 1886 AND 2200),
  make text NOT NULL,
  model text NOT NULL,
  trim text,
  mileage integer CHECK (mileage IS NULL OR mileage >= 0),
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  status vehicle_status NOT NULL DEFAULT 'AVAILABLE',
  exterior_color text,
  transmission text,
  fuel_type text,
  body_style text,
  facts jsonb NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicles_org_vin_uq ON vehicles(organization_id, vin) WHERE vin IS NOT NULL;
CREATE UNIQUE INDEX vehicles_org_stock_uq ON vehicles(organization_id, stock_number) WHERE stock_number IS NOT NULL;
CREATE INDEX vehicles_org_status_idx ON vehicles(organization_id, status);

CREATE TABLE vehicle_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  checksum text,
  status media_status NOT NULL DEFAULT 'READY',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, position)
);

CREATE TABLE vehicle_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_changes_vehicle_idx ON vehicle_changes(vehicle_id, created_at DESC);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'FACEBOOK_MARKETPLACE',
  external_account_key text NOT NULL DEFAULT 'default',
  status listing_status NOT NULL DEFAULT 'DRAFT',
  title text NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  description text NOT NULL,
  external_url text,
  failure_reason text,
  prepared_at timestamptz,
  published_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_org_status_idx ON listings(organization_id, status);
CREATE UNIQUE INDEX listings_active_vehicle_channel_uq
  ON listings(vehicle_id, channel, external_account_key)
  WHERE status IN ('DRAFT', 'PREPARED', 'PUBLISHED', 'REMOVAL_REQUIRED');

CREATE TABLE listing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_events_listing_idx ON listing_events(listing_id, created_at DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status notification_status NOT NULL DEFAULT 'UNREAD',
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_org_user_idx ON notifications(organization_id, user_id, status);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  request_id text NOT NULL,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs(organization_id, created_at DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_status_available_idx ON outbox_events(status, available_at);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);

CREATE TABLE schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
