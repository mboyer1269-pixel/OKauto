# OKauto Requirements

OKauto is a clean-room vehicle inventory and social marketplace listing assistant for dealerships. Shiftly Auto's public website, public Chrome Web Store metadata, and publicly indexed marketing pages were used only as functional references. No proprietary source code, private APIs, trademarks, brand assets, or hidden platform endpoints are used.

## Product reconnaissance

### Verified public reference capabilities

- Dealership-oriented listing software for Facebook Marketplace and Facebook Groups.
- Chrome extension positioned as a fast vehicle posting assistant.
- Dealer dashboard with manager visibility into each salesperson's listing activity.
- Inventory inputs from dealer website, DMS/feed, direct messages, VIN data, photos, and pricing.
- AI-generated compliant descriptions ready for posting.
- Sold-vehicle alerts that prompt salespeople to remove stale marketplace listings.
- Support for auto, RV, marine, powersports, trailer, commercial, and similar inventory.
- Marketing site onboarding form collects industry, monthly volume, company, website, role, budget, contact details, and acquisition source.
- Public value proposition emphasizes rapid posting, inventory accuracy, engagement tracking, and accountability.

### Clean-room product improvements

- Explicit human-in-the-loop marketplace workflow that respects Meta and Chrome policies.
- Resilient site adapters that parse visible page content and JSON-LD where available.
- Duplicate prevention by VIN, source URL, and normalized vehicle identity.
- Sync health, recent failures, and clear recovery guidance.
- Bulk inventory actions and assignment to salespeople.
- Price-change and sold-state snapshots for auditability.
- Accessibility-first responsive dashboard.
- Structured audit logs and notification center.
- Extension permissions limited to active tab, storage, scripting, side panel, and explicit host permissions.

## Roles and permissions

| Role | Capabilities |
| --- | --- |
| Owner | Manage organization, billing placeholders, all dealerships, users, settings, inventory, listings, alerts, and audit logs. |
| Manager | Manage dealership inventory, assignments, listings, analytics, source syncs, and notifications. |
| Salesperson | View assigned inventory, prepare marketplace listings, mark listing milestones, and respond to sold alerts. |
| Analyst | Read-only access to inventory, listing performance, activity, and audit history. |

## User stories and acceptance criteria

### Authentication and organization setup

- As an owner, I can sign in and operate within a dealership organization.
- As a manager, I can invite and assign users to dealership roles.
- Acceptance:
  - Every protected API endpoint resolves an authenticated principal or an extension token.
  - Every domain record is scoped to an organization.
  - Unauthorized roles receive `403` responses with a stable error shape.

### Inventory ingestion and normalization

- As a manager, I can import inventory from CSV, website captures, or manual entry.
- As a salesperson, I can capture a visible vehicle page from the extension and submit it to the dashboard.
- Acceptance:
  - Vehicle inputs are validated with shared Zod schemas.
  - VINs are uppercased and validated when present.
  - Duplicates are matched by VIN first, then canonical source URL, then year/make/model/trim/mileage proximity.
  - Each ingest creates an audit log and updates sync health.

### Listing assistance

- As a salesperson, I can generate marketplace-ready title, description, price, mileage, location, and photo checklist.
- As a salesperson, I can use the extension to copy listing fields and optionally fill visible marketplace form fields after a user click.
- Acceptance:
  - The product never submits marketplace listings automatically.
  - The extension never bypasses login, CAPTCHA, anti-bot controls, rate limits, or platform restrictions.
  - AI output is deterministic by default with optional provider integration guarded by env configuration.

### Dealer dashboard and analytics

- As a manager, I can view inventory status, listing status, salesperson activity, alerts, and sync health.
- As an analyst, I can export or review activity and listing history.
- Acceptance:
  - Dashboard is responsive and keyboard navigable.
  - Listing history records created, posted, updated, price changed, marked sold, and removed milestones.
  - Analytics include active inventory, ready-to-list vehicles, posted listings, sold alerts, average listing age, and per-user activity.

### Sold and price-change detection

- As a manager, I receive notifications when a feed marks a vehicle sold or when a price changes.
- As a salesperson, I receive an alert to remove or update marketplace listings affected by those changes.
- Acceptance:
  - Status/price transitions produce snapshots and notifications.
  - Notifications include recommended next action and affected listing links.
  - Alerts can be acknowledged, resolved, or dismissed with audit history.

## Architecture

```text
apps/web
  Next.js App Router dashboard and REST API route handlers
packages/shared
  Zod schemas, domain types, normalization, dedupe, description generation
packages/db
  Prisma PostgreSQL schema, client, seed/demo data
packages/extension
  Chrome Manifest V3 extension, visible-page capture, popup, side panel, marketplace assist
```

### Runtime services

- Web/API: Next.js with server components and route handlers.
- Database: PostgreSQL via Prisma.
- Queue-ready design: Redis is included for future BullMQ workers for feed polling, media processing, and notification fan-out.
- Observability: structured logger, request IDs, audit logs, and CI checks.
- Extension: MV3 background service worker, content scripts, popup, side panel, and explicit token-based API communication.

## Database schema

Core tables:

- `Organization`: tenant boundary.
- `Dealership`: physical or logical dealer location.
- `User`: account identity and role.
- `Membership`: user role in organization/dealership.
- `Vehicle`: normalized vehicle inventory.
- `VehicleMedia`: photos with source and ordering.
- `InventorySource`: CSV, website, DMS, extension, or manual source.
- `SourceSyncRun`: sync health and failure reporting.
- `Listing`: marketplace listing workflow record.
- `ListingSnapshot`: price/status/history event.
- `ActivityEvent`: salesperson and system activity tracking.
- `Notification`: sold/price/sync/security notification center.
- `AuditLog`: immutable administrative and security log.
- `ExtensionCredential`: hashed extension token metadata.

## API contracts

All responses use JSON. Errors use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Human readable message"
  }
}
```

### `GET /api/v1/dashboard`

Returns summary metrics, inventory, listings, activity, notifications, and sync health for the authenticated organization.

### `POST /api/v1/capture`

Extension ingestion endpoint.

Request:

```json
{
  "sourceUrl": "https://dealer.example/vehicle/123",
  "capturedAt": "2026-07-30T00:00:00.000Z",
  "vehicle": {
    "vin": "1HGCM82633A004352",
    "year": 2022,
    "make": "Toyota",
    "model": "Camry",
    "trim": "SE",
    "price": 23995,
    "mileage": 30210
  },
  "photos": ["https://dealer.example/photo.jpg"]
}
```

Response:

```json
{
  "vehicleId": "uuid",
  "listingId": "uuid",
  "duplicate": false,
  "nextAction": "review_listing"
}
```

### `POST /api/v1/listings/generate`

Creates a marketplace listing draft from a vehicle and dealership context.

### `PATCH /api/v1/listings/:id`

Updates workflow status, assigned user, notes, marketplace URL, or posted timestamp.

### `POST /api/v1/inventory/import`

Accepts CSV JSON rows or normalized vehicle records and creates a sync run with per-row errors.

## Security and policy requirements

- Tenant isolation on every query.
- RBAC checks on every mutation.
- Extension API token hashing and last-used tracking.
- No marketplace credential collection.
- No scraping behind authentication controls unless the authenticated user intentionally captures visible content in their browser.
- No CAPTCHA solving, anti-bot bypass, hidden endpoint calls, automated posting, or rate-limit evasion.
- Audit all admin, import, listing, notification, and extension credential actions.

## Phased implementation plan

1. MVP platform: monorepo, schemas, Prisma data model, seed data, dashboard, route handlers, extension capture, tests, CI, Docker.
2. Production auth: Auth.js or SSO provider, invite flow, passwordless sign-in, extension PKCE/token issuance UI.
3. Feed ingestion workers: CSV/SFTP/XML/DMS adapters, Redis queues, retry policies, media caching.
4. Marketplace workflow depth: additional field adapters, group publishing checklist, per-platform compliance copy.
5. Analytics and observability: event warehouse export, OpenTelemetry traces, alert thresholds, manager reports.

## Current MVP boundaries

- The implemented app ships a production-shaped MVP with real schemas, route contracts, data model, extension workflow, tests, and Docker/CI.
- Local demo mode uses seed data for preview when `DATABASE_URL` is not configured; production and integration deployments use PostgreSQL.
- AI generation is deterministic and safe by default, with an env boundary for provider-backed generation in a later hardening phase.
