# LotPilot — Requirements & Architecture

LotPilot is a clean-room, production-grade alternative to the publicly observable
capabilities of "Shiftly Auto" (https://shiftlyauto.com/): listing software that lets
dealerships post, manage, and track vehicle inventory on Facebook Marketplace.
No proprietary source code, trademarks, protected assets, or hidden APIs were used —
capabilities were reproduced independently from public marketing material and then improved.

---

## 1. Product reconnaissance (publicly observable reference behavior)

Verified from the reference product's public site (marketing pages, FAQ, case studies):

| # | Observed capability | Evidence |
|---|---------------------|----------|
| R1 | Post/manage/promote dealership inventory on Facebook Marketplace "in minutes" | Hero copy |
| R2 | Pulls VIN data, photos, and pricing from DMS or dealer website | "Fb Listing Tool" section |
| R3 | Generates compliant, ready-to-post vehicle descriptions | "Fb Listing Tool" section |
| R4 | Dealer dashboard with real-time tracking of each salesperson's listings | FAQ "How does it work?" |
| R5 | Automated alerts notify sales staff when a vehicle is sold, prompting removal | FAQ "How does it work?" |
| R6 | Salespeople create their own leads / list under their own accounts | Stark Motors testimonial |
| R7 | Multiple verticals: auto, RV/trailer, marine/powersports, mobile homes, equipment, furniture | Demo intake form |
| R8 | Roles at customer orgs: Owner, Executive, Management, Employee/Salesperson | Demo intake form |
| R9 | Chrome-extension-based listing assistance on Marketplace pages | Product category norm (listing tools operate via extension) |

### Assumptions (documented per instructions; safest scalable interpretation)

- **A1** — Listing to Marketplace is *human-in-the-loop*: the extension prepares/fills the
  Facebook "create listing" form for a signed-in human, who reviews and clicks Facebook's own
  Publish button. We never auto-submit, never bypass CAPTCHA/anti-bot/auth/rate limits
  (Meta ToS + Chrome Web Store policy compliance).
- **A2** — Inventory ingestion sources: CSV upload, JSON/CSV feed URL polled on a schedule,
  and manual entry. DMS integrations are modeled as feed adapters behind one interface.
- **A3** — "Sold detection" = a vehicle disappearing from the dealer's feed (for N consecutive
  syncs) or being manually marked sold; both notify every salesperson with an active listing.
- **A4** — Descriptions come from an AI provider when configured (`OPENAI_API_KEY`), with a
  deterministic compliant template engine as fallback so the product works offline.
- **A5** — Primary vertical is automotive; the schema keeps a `category` on vehicles so other
  verticals (R7) can be added without migration.
- **A6** — Photos are referenced by URL from the dealer feed/website; optional re-hosting via a
  pluggable storage driver (local disk now; S3-compatible later).

## 2. User roles & RBAC

| Role | Scope | Capabilities |
|------|-------|--------------|
| `ADMIN` (platform) | global | Manage all orgs/users, view platform audit logs |
| `OWNER` | org | Everything below + billing settings, delete org, manage managers |
| `MANAGER` | org | Manage inventory/sources/members(salespeople), view all analytics, settings |
| `SALESPERSON` | org | View inventory, generate descriptions, prepare/post/delist own listings, own analytics |

A user may belong to multiple organizations (rooftop groups); each membership carries a role.

## 3. User stories & acceptance criteria (implemented)

- **US1 Onboarding** — As a dealer principal I can register, create my dealership, and invite
  staff by email with a role. *AC: register → org created with OWNER membership; invite tokens
  expire; accepting an invite creates the membership with the invited role.*
- **US2 Inventory import** — As a manager I can upload a CSV or configure a feed URL with field
  mapping; vehicles are normalized and de-duplicated by VIN (fallback: stock #, fallback:
  year/make/model/mileage fingerprint). *AC: re-importing the same file creates no duplicates;
  invalid rows are reported per-row, valid rows still import.*
- **US3 VIN decode** — As a user I can enter a VIN and get year/make/model decoded (NHTSA vPIC
  when online, offline WMI/year-char fallback otherwise). *AC: check digit validated; invalid
  VINs rejected with a clear error.*
- **US4 Descriptions** — As a salesperson I can generate a compliant Marketplace description
  per vehicle in one click, edit it, and save it. *AC: template output contains no banned
  claims, always includes disclaimers configured by the org; AI path falls back to template on
  provider failure.*
- **US5 Listing workflow** — As a salesperson I open Facebook Marketplace's vehicle listing
  form; the extension shows my assigned/available inventory, fills form fields on my explicit
  click, copies photos/description to clipboard, and I publish manually. The listing is
  recorded with my identity, timestamps, and the Marketplace URL I confirm. *AC: no automatic
  submission; every state change is an auditable `ListingEvent`.*
- **US6 Sold alerts** — As a salesperson with an active listing I get a notification when the
  vehicle is detected sold or its price changes, telling me to delist/update. *AC: sold
  detection requires `soldDetectionThreshold` consecutive missing syncs; price change creates
  a `PRICE_CHANGE` event and notification.*
- **US7 Dealer dashboard** — As an owner/manager I see inventory counts by status, sync health,
  listings per salesperson, time-to-list, and recent activity. *AC: analytics endpoints return
  per-user aggregates; dashboard renders them.*
- **US8 Audit & admin** — As an owner I can see who did what (imports, edits, listings,
  role changes) with timestamps. *AC: every mutating API writes an `AuditLog` row.*
- **US9 Bulk actions** — As a manager I can select multiple vehicles and archive / mark sold /
  generate descriptions in bulk. *AC: partial failures reported per-vehicle.*
- **US10 Recovery** — As a user I see actionable error states (sync failures with cause, retry
  buttons, extension "selector drift" fallback to copy-mode). *AC: a failed sync stores the
  error on the `SyncRun` and surfaces it in Sync Health.*

## 4. Architecture

```
apps/
  web/         Next.js 15 (App Router) — dealer dashboard UI + REST API (/api/v1/*)
  worker/      Node job runner — BullMQ on Redis (or in-process scheduler w/o Redis)
  extension/   Chrome Manifest V3 — popup (React), content script overlay, service worker
packages/
  core/        Pure domain logic: VIN, normalization, dedupe, diffing, descriptions, mapping
  db/          Prisma schema + client + migrations + seed
```

- **Web/API**: Next.js route handlers under `/api/v1`. Session auth = signed HttpOnly JWT
  cookie (jose, HS256). Extension auth = long-lived hashed API tokens (`Authorization: Bearer`).
  Zod validation at every boundary; RBAC middleware per org; rate limiting on auth endpoints;
  pino structured logs with request IDs; `/api/health` liveness.
- **Worker**: repeatable jobs — `sync-source` (poll feeds), `detect-sold` (threshold check),
  `dispatch-notifications` (email fan-out). BullMQ when `REDIS_URL` is set; otherwise a
  self-contained interval scheduler so dev works without Redis. Heartbeat row for observability.
- **Extension**: MV3. Service worker holds token + talks to API. Content script mounts an
  isolated overlay on `facebook.com/marketplace/create/vehicle` that renders vehicle data,
  per-field "Fill" and "Copy" buttons, and a "Mark as posted" confirm step. Resilient
  selector adapters: label-text based lookup with versioned fallback chains; when selectors
  drift, it degrades gracefully to copy-mode (never breaks the user).
- **Database**: PostgreSQL 14+ via Prisma. All multi-tenant tables carry `organizationId`
  and are query-scoped by membership.

## 5. Database schema (Prisma, summarized)

- `User` (email unique, passwordHash argon2/bcrypt, platformRole)
- `Organization` (name, slug, website, phone, address, settings: disclaimers, soldDetectionThreshold, defaultLocation)
- `Membership` (user↔org, role, unique per pair)
- `Invitation` (org, email, role, tokenHash, expiresAt, acceptedAt)
- `ApiToken` (user, org, name, tokenHash unique, lastUsedAt, revokedAt) — extension auth
- `InventorySource` (org, type CSV|FEED_JSON|FEED_CSV|MANUAL, url, fieldMapping JSON, scheduleMinutes, isActive, lastSyncAt, lastError)
- `SyncRun` (source, status, stats {created,updated,priceChanges,markedMissing,markedSold}, error, startedAt/finishedAt)
- `Vehicle` (org, vin, stockNumber, category, year/make/model/trim, body/drivetrain/transmission/fuel/engine, colors, mileage, priceCents, previousPriceCents, condition, status AVAILABLE|PENDING|SOLD|ARCHIVED, description, descriptionSource, source, missingSinceSyncs, firstSeenAt/lastSeenAt/soldAt; unique (org, vin) & (org, stockNumber))
- `VehiclePhoto` (vehicle, url, position, storageKey)
- `PriceChange` (vehicle, old/new cents, detectedAt, syncRun)
- `Listing` (org, vehicle, user, marketplace FACEBOOK, status DRAFT|PREPARED|POSTED|DELIST_REQUESTED|DELISTED|ERROR, externalUrl, postedAt, delistedAt)
- `ListingEvent` (listing, type, data JSON, actor)
- `Notification` (org, user, type, title, body, data JSON, readAt)
- `AuditLog` (org, user, action, entityType, entityId, data JSON, ip)
- `WorkerHeartbeat` (name, lastBeatAt)

## 6. API contracts (REST, `/api/v1`, JSON; errors: `{ error: { code, message, details? } }`)

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Orgs | `POST /orgs`, `GET /orgs`, `GET/PATCH /orgs/:orgId`, `GET /orgs/:orgId/members`, `PATCH/DELETE /orgs/:orgId/members/:userId` |
| Invites | `POST /orgs/:orgId/invitations`, `GET /orgs/:orgId/invitations`, `DELETE .../:id`, `POST /invitations/accept` |
| Tokens | `POST/GET /orgs/:orgId/tokens`, `DELETE /orgs/:orgId/tokens/:id` |
| Vehicles | `GET/POST /orgs/:orgId/vehicles` (filter/search/sort/paginate), `GET/PATCH/DELETE .../:vehicleId`, `POST .../import` (CSV multipart), `POST .../bulk` (archive/sold/describe), `POST .../:vehicleId/describe`, `POST /vin/decode` |
| Sources | `GET/POST /orgs/:orgId/sources`, `PATCH/DELETE .../:id`, `POST .../:id/sync` (manual trigger), `GET .../:id/runs` |
| Listings | `GET/POST /orgs/:orgId/listings`, `GET/PATCH .../:id` (status transitions), `GET .../:id/events` |
| Analytics | `GET /orgs/:orgId/analytics/overview`, `GET /orgs/:orgId/analytics/salespeople` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Audit | `GET /orgs/:orgId/audit-logs` |
| Extension | `GET /ext/bootstrap` (me+org+settings), `GET /ext/vehicles?listable=1`, `POST /ext/listings`, `POST /ext/listings/:id/events`, `POST /ext/listings/:id/posted` |
| Ops | `GET /health` |

## 7. Improvements over the reference

1. **Resilient selector adapters** with versioned fallback chains + copy-mode degradation.
2. **Duplicate prevention** at import (VIN/stock/fingerprint) *and* at listing time (warns if
   an active listing already exists for the vehicle by any teammate).
3. **Sync health page**: per-source run history, error causes, retry button, staleness badges.
4. **Bulk actions** with per-row result reporting.
5. **Observability**: structured logs, request IDs, worker heartbeats, health endpoint.
6. **Accessibility**: semantic HTML, keyboard-navigable tables/menus, ARIA labels, WCAG AA colors.
7. **Mobile-responsive dashboard** (sidebar collapses; tables adapt).
8. **Recovery-first error states** everywhere (actionable messages + retries).
9. **Compliance guardrails baked in**: no auto-submit, no CAPTCHA/anti-bot interference,
   throttled assistance, org-level disclaimer injection into every description.

## 8. Phased implementation plan (all phases implemented in this repo)

1. **P0 Foundation** — monorepo, tooling, Prisma schema+migrations+seed, core domain lib w/ tests.
2. **P1 Identity** — auth, orgs, memberships, invitations, RBAC, API tokens, audit logging.
3. **P2 Inventory** — CSV import, feed sources, VIN decode, normalization, photos, bulk actions.
4. **P3 Listings** — description generation, listing lifecycle, extension endpoints.
5. **P4 Automation** — worker: scheduled sync, sold/price-change detection, notifications.
6. **P5 Dashboard** — full UI: onboarding→analytics, sync health, notifications, settings, admin.
7. **P6 Extension** — MV3 popup + Marketplace overlay + tracking.
8. **P7 Hardening** — tests (unit/integration/E2E), CI, Docker, docs, security validation.

## 9. Non-functional requirements

- TypeScript strict everywhere; ESLint + Prettier; Vitest (unit/integration) + Playwright (E2E).
- Secrets only via env (`.env.example` provided); passwords bcrypt(12); tokens stored hashed
  (SHA-256); session cookies HttpOnly/SameSite=Lax/Secure in prod.
- Multi-tenant isolation enforced in a single `requireOrgRole` guard used by every org route.
- P95 API latency target < 300ms on 10k-vehicle orgs (indexed queries, paginated lists).
- CI: lint → typecheck → unit tests → integration tests (Postgres service) → builds.
