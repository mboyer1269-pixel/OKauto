# DriveFlow Requirements and Architecture

DriveFlow is a clean-room dealership inventory and listing-assistance platform. It uses public product claims from Shiftly Auto only as workflow references. It does not use Shiftly code, branding, assets, private APIs, or authenticated product behavior.

## 1. Reconnaissance

Research was performed from public pages on July 30, 2026. No account was created, no extension package was downloaded, and no hidden interface or API was inspected.

### Verified reference capabilities

- A dealer inventory source supplies VINs, prices, photos, mileage, trim, and descriptions.
- Salespeople use a Chrome extension to prepare vehicle listings for Facebook Marketplace and Facebook Groups.
- Managers use a dealer portal to see how many listings each salesperson posted and when.
- Inventory is tracked through at least live, pending, and sold states.
- Staff receive sold-vehicle alerts and are prompted to remove stale Marketplace listings.
- Public materials claim ready-to-post/SEO descriptions, fast per-unit workflows, and activity analytics.
- The public extension listing describes a user-facing Marketplace/Groups posting assistant. It does not document unattended publishing.
- Public support materials acknowledge recoverable workflow errors such as missing file selection.

Sources:

- https://shiftlyauto.com/
- https://shiftlyauto.com/software
- https://shiftlyauto.com/facebook-listing-tool
- https://shiftlyauto.com/blogs/car-salesmen-multiply-income-shiftly
- https://shiftlyauto.com/blogs/sell-more-cars-on-facebook-marketplace
- https://chromewebstore.google.com/detail/shiftly-auto-lister/ekojgodjldjgppkjnjacbeedofegfioh
- https://shiftlyautolister.com/

### Assumptions

- VIN is the primary natural identity within an organization; stock number is the fallback for non-VIN inventory.
- Inventory sources are CSV, JSON, or scheduled HTTPS feeds in the MVP. DMS-specific adapters can implement the same interface later.
- Feed state, DriveFlow state, and external listing state are separate and have explicit timestamps/provenance.
- Sold detection comes from a previously active vehicle disappearing from a complete feed or changing to a sold status.
- Marketplace publishing and removal always require a human action in the user's authenticated browser session.
- Marketplace engagement metrics are manually entered or imported only through authorized APIs. DOM scraping of private engagement data is out of scope.
- Email/webhook delivery is implemented through a provider-neutral outbox; in-app notifications always work.

## 2. Product goals and non-goals

### Goals

1. Import and normalize dealership inventory reliably.
2. Help a salesperson prepare an accurate listing in under 60 seconds.
3. Prevent duplicate active listings and stale sold listings.
4. Give managers auditable team activity and sync-health visibility.
5. Recover clearly from feed, photo, browser, permission, and selector failures.
6. Keep organizations isolated and enforce least-privilege access.

### Non-goals

- No CAPTCHA solving, credential collection, automated login, unattended submission, rate-limit evasion, or anti-bot bypass.
- No use of private Meta APIs or simulated API calls.
- No claim that a prepared draft was published until the user explicitly confirms it.
- No paid advertising management, CRM, financing, or lead-message automation in the MVP.

## 3. Users and RBAC

| Role | Capabilities |
| --- | --- |
| `OWNER` | Organization, users, sources, inventory, listings, audit, settings |
| `MANAGER` | Users (except owners), sources, inventory, listings, reports, settings |
| `SALESPERSON` | Read available inventory, create/confirm own listings, view own activity |
| `VIEWER` | Read dashboard, inventory, listings, and reports |

Every data-bearing query is scoped by `organizationId`. Cross-organization identifiers return `404`, not an authorization oracle.

## 4. User stories and acceptance criteria

### Authentication and onboarding

- As an invited user, I can sign in with email/password and receive a secure, expiring, revocable HTTP-only session.
- As an owner, I can create a dealership profile, timezone, price policy, description voice, and notification preferences.
- Passwords are salted and hashed; login is rate-limited; session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

### Inventory ingestion

- As a manager, I can upload CSV/JSON or configure an HTTPS feed.
- A feed run records start/end time, counts, warnings, checksum, and error details.
- VINs are validated using ISO 3779 transliteration/check digit where applicable; invalid VINs are rejected with row-level errors.
- Repeated VINs do not create duplicate vehicles. Updates preserve change history.
- Complete feeds mark missing active units as `STALE`, then `SOLD` only after the configurable grace period.
- Price changes and sold transitions create events, notifications, and affected-listing tasks.

### Listing workflow

- As a salesperson, I can select an available vehicle, review photos/price/description, and create one draft per channel/account.
- Duplicate active drafts/listings are blocked by a database constraint and a user-readable conflict response.
- AI-assisted descriptions are grounded only in stored vehicle facts, exclude unsupported claims, and remain editable.
- The extension fetches a short-lived preparation payload, fills recognized visible fields after a click, and shows a review checklist.
- The extension never clicks Publish/Submit/Next, never bypasses challenges, and reports unsupported-page/selector failures without destructive fallback.
- A user explicitly confirms publication and may store the resulting public listing URL.

### Lifecycle and alerts

- Sold and price-change events create actionable in-app notifications.
- Sold listings move to `REMOVAL_REQUIRED`; the user confirms external removal before `REMOVED`.
- Managers can filter pending, prepared, published, stale, removal-required, removed, and failed records.

### Analytics and administration

- Managers see units available/sold, listing states, sync health, posts by salesperson, and recent activity.
- Owners/managers can inspect immutable audit events containing actor, action, entity, request ID, timestamp, and safe metadata.
- Bulk actions support draft creation and assignment but never external bulk submission.

### Error and recovery states

- Authentication expired: preserve local selection and ask the user to sign in.
- Feed unavailable/invalid: keep the last good inventory snapshot, mark source unhealthy, and retry with bounded backoff.
- Missing photos: block preparation or allow an explicit no-photo exception according to policy.
- Selector drift: stop, show which fields were not found, and offer copy-to-clipboard/manual completion.
- Partial photo transfer: identify failed photos and allow retry; do not publish.
- Version mismatch: extension asks for an update when the API contract major version is unsupported.
- Offline/rate-limited: exponential backoff with jitter and visible next retry.

## 5. Architecture

```text
Next.js web + REST API ── PostgreSQL (system of record)
          │              ├─ organizations, users, sessions
          │              ├─ sources, sync runs, vehicles, media
          │              ├─ listing drafts/history
          │              └─ notifications, audit, outbox
          ├── Redis/BullMQ workers (feed sync, alerts, description jobs)
          ├── S3-compatible object storage (production media)
          └── Manifest V3 extension
                ├─ side panel: inventory selection/review
                ├─ service worker: authenticated API coordination
                └─ content script: user-triggered form assistance only
```

The web/API process is stateless. PostgreSQL is authoritative. Redis jobs are at-least-once, so handlers use idempotency keys and transactions. The extension receives minimal short-lived listing payloads and stores only API origin, non-sensitive preferences, and selected vehicle ID.

## 6. Database schema

Core entities:

- `Organization(id, name, slug, timezone, settings, createdAt, updatedAt)`
- `User(id, email, passwordHash, name, status, createdAt, updatedAt)`
- `Membership(id, organizationId, userId, role)`
- `Session(id, userId, tokenHash, expiresAt, revokedAt)`
- `InventorySource(id, organizationId, type, name, url, config, status, lastSuccessAt)`
- `SyncRun(id, sourceId, status, startedAt, finishedAt, counts, error)`
- `Vehicle(id, organizationId, sourceId, vin, stockNumber, year, make, model, trim, mileage, priceCents, status, facts, firstSeenAt, lastSeenAt, soldAt)`
- `VehicleMedia(id, vehicleId, url, position, checksum, status)`
- `VehicleChange(id, vehicleId, type, before, after, createdAt)`
- `Listing(id, organizationId, vehicleId, assigneeId, channel, externalAccountKey, status, title, priceCents, description, externalUrl, preparedAt, publishedAt, removedAt)`
- `ListingEvent(id, listingId, actorId, type, metadata, createdAt)`
- `Notification(id, organizationId, userId, type, title, body, status, entityType, entityId, createdAt, readAt)`
- `AuditLog(id, organizationId, actorId, action, entityType, entityId, requestId, ipHash, metadata, createdAt)`
- `OutboxEvent(id, organizationId, topic, payload, idempotencyKey, status, attempts, availableAt)`

Important constraints: unique normalized email; unique membership; unique `(organizationId, vin)` when VIN exists; unique `(organizationId, stockNumber)` when stock number exists; and one non-terminal listing per `(vehicleId, channel, externalAccountKey)`.

## 7. API contract

All endpoints are under `/api/v1`, return JSON, require a session unless noted, and attach `x-request-id`.

| Method | Path | Purpose | Roles |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Create session | Public |
| `POST` | `/auth/logout` | Revoke session | Any |
| `GET` | `/me` | User, memberships, active organization | Any |
| `GET/POST` | `/vehicles` | Search/list or create/manual import | Read / manager |
| `POST` | `/inventory/import` | Idempotent CSV/JSON ingestion | Owner, manager |
| `GET` | `/inventory/sync-runs` | Source health/history | Owner, manager |
| `GET/POST` | `/listings` | Filter or create drafts | Any / salesperson+ |
| `POST` | `/listings/:id/prepare` | Issue short-lived extension payload | Assigned user/manager |
| `POST` | `/extension/preparations` | Redeem a signed 10-minute preparation code or confirm publication | Scoped handoff |
| `POST` | `/listings/:id/confirm` | Confirm published/removed/failed state | Assigned user/manager |
| `POST` | `/descriptions/generate` | Generate grounded description | Salesperson+ |
| `GET` | `/dashboard` | KPIs, activity, sync health | Any (role-filtered) |
| `GET/PATCH` | `/notifications` | List/mark read | Any |
| `GET` | `/audit` | Cursor-paginated audit events | Owner, manager |
| `GET` | `/health/live` | Process liveness | Public |
| `GET` | `/health/ready` | DB/Redis readiness | Internal |

Errors use `{ "error": { "code": string, "message": string, "details"?: unknown }, "requestId": string }`. Inventory/listing retries are duplicate-safe through natural identities and database constraints; outbox jobs use explicit idempotency keys.

## 8. Security, privacy, and compliance

- CSRF defenses combine same-site cookies, origin validation, and JSON-only mutations.
- Zod validates API payloads; Prisma parameterizes SQL.
- Password and token material never enters logs. Audit IP values are keyed hashes.
- Organization IDs come from the authenticated membership, never trusted request payloads.
- Feed URLs reject private/link-local targets to mitigate SSRF; redirects are revalidated.
- Content Security Policy and Manifest V3 least-privilege permissions are enforced.
- Media URLs are allowlisted HTTPS and fetched server-side only through the validated adapter.
- Retention defaults: sessions 30 days, sync payloads 7 days, audit 1 year, deleted-user PII anonymized.
- Accessibility target is WCAG 2.2 AA; keyboard use, focus, labels, reduced motion, and contrast are tested.

## 9. Delivery phases

1. Foundation: schema, auth, tenancy, RBAC, audit, health.
2. Inventory: import adapters, normalization, source health, lifecycle, jobs.
3. Listings: grounded descriptions, drafts, duplicate prevention, events, alerts.
4. Extension: side panel, short-lived payload, resilient field adapters, user confirmation.
5. Operations: dashboard, bulk assignment, observability, Docker, CI/CD.
6. Hardening: unit/integration/E2E, dependency/security scans, load and recovery tests.

The repository implements a runnable production-quality MVP of all six phases. Future DMS adapters and authorized notification providers plug into documented interfaces rather than changing the domain model.
