# OKauto — Product & Engineering Requirements

> **Clean-room notice.** OKauto is an independent, clean-room implementation of a
> dealership listing-assistance platform. It was designed from **publicly observable
> behavior** of the reference product (public marketing site, public Chrome Web Store
> listing copy, and public FAQ). No proprietary source code, trademarks, images,
> copy assets, or private/hidden APIs were accessed or reproduced. All code, UI copy,
> schema, and architecture in this repository are original.

---

## 1. Reference reconnaissance (verified from public sources)

Observed on `https://shiftlyauto.com/` and its public pages (verified 2026-07-30):

| # | Verified capability (public claim) | Source |
|---|-----------------------------------|--------|
| V1 | Chrome extension ("lister") assists posting vehicle listings to Facebook Marketplace; "post a unit in ~60 seconds" | Public site + public extension store copy |
| V2 | Extension supports posting multiple vehicles and posting to Facebook Groups | Public extension store copy |
| V3 | Pulls VIN data, photos, and pricing from the dealer's DMS or website | Public site |
| V4 | Generates "compliant", ready-to-post listing descriptions | Public site |
| V5 | Dealer dashboard shows **real-time per-salesperson listing activity** (how many listings each rep posted) | Public site (`/dealership-listing-tool`, `/software`) |
| V6 | Automated/AI alerts notify sales staff when a listed vehicle is **sold**, prompting removal of the Marketplace listing | Public site FAQ + feature pages |
| V7 | Multi-vertical positioning: automotive, RV/trailers, marine/powersports, mobile homes, real estate, farm/equipment, furniture | Public onboarding form |
| V8 | Onboarding: demo request + "connect your dealership" flow | Public site |
| V9 | Inventory management from one dashboard: track active vs. sold vehicles, keep ads "fresh" | Public `/software` page |

**Unverifiable / intentionally not reproduced:** proprietary selector code, private API
endpoints, server infrastructure, pricing, branding, and any anti-bot behavior. We assume
the extension operates **through the user's own authenticated browser session** and
therefore design OKauto strictly as *human-in-the-loop assistive automation*.

### Policy guardrails (hard requirements)

- **G1.** Never bypass or automate around CAPTCHAs, anti-bot challenges, login flows, or rate limits.
- **G2.** The extension never clicks "Publish"/final-submit on behalf of the user. It fills and
  reviews; the human confirms and submits. Same for deletions.
- **G3.** The extension only runs on `facebook.com` marketplace pages explicitly allowed in the
  manifest, using the user's own session. No credential collection of any third party.
- **G4.** Respect robots/rate expectations of inventory feed sources; sync intervals are
  configurable and bounded.
- **G5.** Generated descriptions follow marketplace vehicle-listing policies: truthful specs,
  no misleading claims, no prohibited content, dealer disclosure footer.

---

## 2. Product definition

**OKauto** is a three-surface platform:

1. **Dealer Dashboard (web app)** — inventory, listings lifecycle, team activity, analytics,
   notifications, settings, administration.
2. **API + worker service** — multi-tenant data plane: auth/RBAC, inventory ingestion &
   normalization, VIN decode, dedupe, sold/price-change detection, description generation,
   listing state machine, notifications, audit log, job queue.
3. **Chrome Extension (MV3)** — pairs with a dealer account; pulls a personal "listing queue";
   on Facebook Marketplace's vehicle create form it *assists* the user by filling fields and
   staging photos (human reviews & publishes); reports outcomes back to the platform.

### 2.1 User roles (RBAC)

| Role | Scope | Capabilities |
|------|-------|--------------|
| `PLATFORM_ADMIN` | global | Manage all orgs, view audit logs, system health. No listing actions inside orgs unless also a member. |
| `ORG_OWNER` | org | Everything in org: settings, integrations, members/roles, billing placeholder, inventory, listings, tokens. |
| `ORG_MANAGER` | org | Inventory, listings, team analytics, notifications; manage salespeople (invite/deactivate); cannot change org settings or owner. |
| `SALESPERSON` | org (self) | View inventory, generate descriptions, manage **own** listing queue & listings, own notifications, own extension tokens. |

Permissions are enforced server-side on every route (see `packages/shared/src/rbac.ts`).

### 2.2 Inventory lifecycle

```
INGESTED → NORMALIZED → ACTIVE ⇄ PRICE_CHANGED
                 │            │
                 │            └─(disappears from feed / flagged sold)→ SUSPECTED_SOLD →(confirm)→ SOLD
                 └─(manual)→ ARCHIVED
```

- Sources: **CSV upload**, **JSON feed URL (pull)**, **push webhook**, **manual entry**.
- Normalization: trim/case canonicalization, unit coercion (mileage int, price cents),
  VIN validation + decode (check digit, model year, WMI region/make), photo URL validation.
- Dedupe: unique `(orgId, vin)` when VIN present; otherwise `(orgId, stockNumber)`;
  merge keeps newest data, preserves history.
- Every price change writes a `PriceHistory` row and raises a `PRICE_CHANGED` event.
- A vehicle present in the previous successful sync but absent in the latest one (same source)
  becomes `SUSPECTED_SOLD` → notification to the listing owner(s) to confirm & remove the ad.

### 2.3 Listing lifecycle (state machine)

```
DRAFT → READY → QUEUED → ASSIGNED → IN_PROGRESS → LIVE
                          │             │           │
                          │             │           ├─(sold detected)→ NEEDS_REMOVAL → REMOVED (soldConfirmed)
                          │             │           ├─(user marks)→ ENDED
                          │             └─ failure → ATTENTION (recoverable: retry / re-queue)
                          └─ cancel → DRAFT
```

- `ATTENTION` is the explicit failure/recovery state: every failure records reason +
  remediation hint; one-click re-queue.
- Every transition is an append-only `ListingEvent` (actor, from, to, note) → full audit trail.
- Duplicate prevention: only one non-terminal listing per vehicle per channel
  (`MARKETPLACE`, `GROUPS`) — enforced by a partial unique index.

### 2.4 Extension workflow (human-in-the-loop)

1. User installs extension → Options page → paste **pairing token** (PAT generated in dashboard).
2. Popup shows connection health + personal queue (vehicles `READY/QUEUED` assigned to me).
3. User clicks **"Assist listing"** → extension opens/navigates to Marketplace vehicle-create
   page → content script:
   - waits for the form via a **resilient selector adapter** (ordered strategies:
     ARIA role+name, label association, placeholder text, name attributes; fuzzy fallback with
     confidence scoring; logs which strategy matched for observability),
   - fills title/price/description/year/make/model/mileage/body style/fuel/transmission,
   - downloads photos via background worker and stages them into the file input
     (`DataTransfer`), user can remove/reorder,
   - renders a review banner with a checklist; **the user clicks Publish** (G2).
4. Content script detects post-publish navigation, captures the resulting listing URL, and
   reports `LIVE` (+ URL) to the API. If the flow aborts, it reports `ATTENTION` with reason.
5. **Sold-removal assist:** from a `NEEDS_REMOVAL` notification, extension opens the user's
   Marketplace "your listings" page, locates the matching listing by captured URL or exact
   title, and guides the user through deletion — again the human confirms.

### 2.5 Notifications & analytics

- In-app notification center + SSE realtime stream; email transport is pluggable
  (default: log transport; SMTP/webhook via env).
- Types: `SOLD_SUSPECTED`, `SOLD_CONFIRMED`, `PRICE_CHANGED`, `LISTING_LIVE`,
  `LISTING_ATTENTION`, `IMPORT_FAILED`, `IMPORT_COMPLETED`, `SYNC_HEALTH`.
- Analytics: per-salesperson listings/day (7/30d), queue aging, listing funnel
  (queued→live→removed), inventory counts by status, import/sync health.

---

## 3. Architecture

```
┌──────────────┐   HTTPS/JSON    ┌───────────────────────────────┐
│ Chrome Ext   │ ◄─────────────► │                               │
│ (MV3)        │   SSE (notify)  │  apps/api  (Fastify, Node 22) │
└──────────────┘ ◄─────────────► │   ├─ modules: auth, orgs,     │
┌──────────────┐   HTTPS/JSON    │   │  members, vehicles,       │
│ Next.js web  │ ◄─────────────► │   │  imports, listings,       │
│ dashboard    │                 │   │  descriptions, notify,    │
└──────────────┘                 │   │  analytics, admin         │
                                 │   ├─ services: vin, normalize,│
                                 │   │  dedupe, descriptions,    │
                                 │   │  sold-detect              │
                                 │   └─ jobs: PG-backed queue    │
                                 │        (SKIP LOCKED, backoff, │
                                 │         dead-letter)          │
                                 └──────────────┬────────────────┘
                                                │ Prisma
                                        ┌───────▼───────┐
                                        │ PostgreSQL 16 │
                                        └───────────────┘
```

**Stack rationale**

| Choice | Why |
|--------|-----|
| TypeScript everywhere (strict) | one language, shared zod schemas between API/web/extension |
| Fastify 5 | fast, schema-first validation, testable via `inject` |
| Prisma + PostgreSQL 16 | typed migrations, JSONB for feed payloads, partial unique indexes for dedupe |
| PG-backed job queue (custom, `FOR UPDATE SKIP LOCKED`) | zero extra infra vs. Redis; retries with exponential backoff, concurrency limits, dead-letter inspection; swappable behind `JobQueue` interface |
| Next.js 15 (App Router) + Tailwind | fast dashboard delivery, RSC + route handlers, responsive/a11y |
| MV3 extension, esbuild bundle | minimal deps, deterministic build, CSP-safe (no remote code) |
| Vitest + Playwright | unit/integration/E2E in one toolchain |

**Clean-room VIN decode:** local deterministic decoder (ISO 3779 check digit, model-year
table, WMI → region/make map for common WMIs). Optional provider interface can call the
public NHTSA vPIC API when `VIN_PROVIDER=vpic` (public government API, off by default).

**Description engine:** `DescriptionProvider` interface. Default `TemplateProvider` —
deterministic, compliance-checked (banned-phrase filter, disclosure footer, spec-fact
serialization). Optional OpenAI-compatible provider enabled only when `OPENAI_API_KEY` is set.

---

## 4. Database schema (summary — source of truth: `packages/database/prisma/schema.prisma`)

- `User(id, email, passwordHash, name, status, isPlatformAdmin, timestamps)`
- `Organization(id, name, slug, vertical, timezone, settings jsonb, status)`
- `Membership(userId, orgId, role, status)` — unique (user, org)
- `Invite(id, orgId, email, role, tokenHash, expiresAt, acceptedAt)`
- `RefreshToken(id, userId, tokenHash, expiresAt, revokedAt, rotatedFrom)` — rotation + reuse detection
- `ExtensionToken(id, userId, orgId, label, tokenHash, prefix, lastUsedAt, revokedAt)`
- `Vehicle(id, orgId, vin?, stockNumber?, year, make, model, trim?, bodyStyle?, fuelType?, transmission?, drivetrain?, mileage?, priceCents, currency, condition, exteriorColor?, interiorColor?, description?, status, sourceId?, firstSeenAt, lastSeenAt, soldAt?, rawPayload jsonb)` — unique (orgId, vin) where vin present; unique (orgId, stockNumber) where present
- `VehiclePhoto(id, vehicleId, url, position, width?, height?, checksum?)`
- `PriceHistory(id, vehicleId, priceCents, changedById?, source, createdAt)`
- `ImportSource(id, orgId, type: CSV|JSON_FEED|WEBHOOK|MANUAL, name, config jsonb, scheduleMinutes, lastRunAt, lastStatus, lastError, status)`
- `ImportRun(id, sourceId, status, stats jsonb, startedAt, finishedAt, error?)`
- `Listing(id, orgId, vehicleId, channel, status, title, descriptionCents?… , assigneeId, externalUrl?, externalId?, failureReason?, postedAt?, removedAt?…)` — partial unique (vehicleId, channel) where status in non-terminal set
- `ListingEvent(id, listingId, actorUserId?, actorType, fromStatus?, toStatus, note?, meta jsonb, createdAt)`
- `Notification(id, orgId, userId?, type, title, body, data jsonb, readAt?, createdAt)`
- `AuditLog(id, orgId?, actorUserId?, actorType, action, entityType, entityId?, meta jsonb, ip?, createdAt)`
- `Job(id, kind, payload jsonb, status, runAt, attempts, maxAttempts, lockedAt?, lockedBy?, lastError?, createdAt, updatedAt)` — queue table
- `DescriptionTemplate(id, orgId, name, body, isDefault, complianceFooter)`

All org-scoped tables carry `orgId`; every query is org-filtered by middleware (tenant isolation).

---

## 5. API contract (v1, `/api/v1`, JSON, bearer JWT or extension PAT)

Auth: `POST /auth/register` (creates org + owner), `POST /auth/login`, `POST /auth/refresh`
(httpOnly cookie), `POST /auth/logout`, `GET /auth/me`.

Orgs/members: `GET/PATCH /orgs/current`, `GET /members`, `PATCH /members/:id` (role/status),
`POST /invites`, `POST /invites/accept`, `DELETE /invites/:id`.

Inventory: `GET /vehicles` (q, status, make, price range, assignee-less, pagination cursor),
`GET /vehicles/:id` (photos, price history, listings), `POST /vehicles` (manual),
`PATCH /vehicles/:id`, `POST /vehicles/:id/archive`, `POST /vehicles/:id/mark-sold`,
`POST /vehicles/bulk` (generate-descriptions | queue-listings | mark-sold | archive).

Imports: `GET/POST /imports/sources`, `PATCH/DELETE /imports/sources/:id`,
`POST /imports/sources/:id/run`, `GET /imports/runs`, `POST /imports/csv` (multipart),
`POST /imports/webhook/:sourceId` (HMAC-signed push).

Listings: `GET /listings`, `POST /listings` (draft from vehicle), `PATCH /listings/:id`,
`POST /listings/:id/transition` (`{to, note?, externalUrl?}` — validated against state machine),
`GET /listings/:id/events`, `GET /listings/queue/mine`.

Descriptions: `POST /vehicles/:id/description:generate` (`{templateId?, tone?}`),
`GET/POST/PATCH /description-templates`.

Notifications: `GET /notifications`, `POST /notifications/:id/read`,
`POST /notifications/read-all`, `GET /notifications/stream` (SSE).

Analytics: `GET /analytics/overview`, `GET /analytics/salespeople?days=`,
`GET /analytics/sync-health`.

Extension: `POST /extension/tokens` (create PAT), `GET /extension/tokens`,
`DELETE /extension/tokens/:id`, `GET /extension/ping`, plus bearer-PAT access to
`listings/queue/mine`, `listings/:id/transition`, `vehicles/:id`.

Admin (platform): `GET /admin/orgs`, `GET /admin/audit-logs`, `GET /admin/jobs?status=dead`.

System: `GET /healthz`, `GET /readyz`, `GET /metrics` (Prometheus text).

Errors: RFC-7807-ish `{ error: { code, message, details? } }`, stable `code` strings,
request-id header echoed.

---

## 6. User stories & acceptance criteria (MVP)

**US-1 Onboarding.** As an owner I register, name my dealership, pick a vertical, and land in
a guided checklist (add inventory → generate description → install extension → invite team).
*AC:* fresh account reaches dashboard with 4-step checklist; each step deep-links; completion
persists per org.

**US-2 Inventory import.** As a manager I upload a CSV or configure a JSON feed; vehicles are
normalized, VIN-decoded, deduped; a run report shows created/updated/unchanged/failed rows with
row-level errors. *AC:* re-importing the same file yields 0 created, N unchanged; a row with a
bad VIN fails with a clear error and doesn't block others.

**US-3 Sold detection.** When a vehicle vanishes from the feed, it becomes `SUSPECTED_SOLD`,
its LIVE listings become `NEEDS_REMOVAL`, and assignees get a realtime notification.
*AC:* simulated feed removal triggers notification ≤ next sync; confirm action sets vehicle
`SOLD`, listing `REMOVED`, writes events + audit entries.

**US-4 Description assist.** As a salesperson I generate a compliant description in one click,
edit it, and regenerate with a different tone. *AC:* output includes year/make/model, key specs,
dealer disclosure; banned phrases are stripped; my edit persists to the vehicle/listing.

**US-5 Listing queue & extension assist.** As a salesperson I see my queue in the extension
popup, start an assisted listing, watch fields fill, review, and publish myself; the dashboard
shows the listing LIVE with its Marketplace URL within seconds. *AC:* extension never auto-
submits; publish detection reports URL; abort path lands listing in `ATTENTION` with reason and
a re-queue action.

**US-6 Team activity.** As a manager I see listings per rep (today/7d/30d), queue aging, and
funnel counts. *AC:* numbers match `ListingEvent` audit data; export to CSV works.

**US-7 Notifications.** As any member I receive in-app + realtime notifications for sold
suspects, listing attention, and import failures; I can mark read. *AC:* SSE delivers within 2s
of event; unread badge accurate after reload.

**US-8 RBAC & audit.** A salesperson cannot access admin/manager endpoints or other orgs' data
(tenant isolation), and sensitive actions are audit-logged. *AC:* integration tests assert 403/
404 cross-tenant; audit rows exist for transitions, member changes, token creation.

**US-9 Failure recovery.** API/job failures are observable: dead-letter jobs listed in admin,
imports retry with backoff, listings carry remediation hints. *AC:* killing a worker mid-job
loses nothing (lock expiry reclaims); a permanently failing job lands in `DEAD` with last error.

---

## 7. Non-functional requirements

- **Security:** bcrypt password hashing; JWT access (15 min) + rotating refresh tokens with
  reuse detection; PATs hashed (sha256) with prefix lookup; org-scoped authorization on every
  query; zod validation on all inputs; security headers; CORS allowlist; rate limiting on auth
  endpoints; audit trail; secrets only via env.
- **Observability:** pino structured logs with request ids; `/metrics` (counters: imports,
  listings transitions, notifications, jobs); import run reports; sync-health endpoint.
- **Performance:** cursor pagination on inventory/listings; composite indexes on hot paths;
  queue polling with jitter; SSE heartbeat.
- **Accessibility & UX:** semantic HTML, labelled controls, focus-visible states, keyboard-
  operable menus/dialogs, color-contrast-safe palette, responsive down to 360 px.
- **Reliability:** all queue jobs idempotent (natural keys); DB transactions around multi-write
  flows; graceful shutdown drains worker.

---

## 8. Phased implementation plan

- **P0 (this milestone):** monorepo scaffold; shared schemas/RBAC; Prisma schema + migrations +
  seed; API auth/orgs/members/vehicles/imports/listings/descriptions/notifications/analytics/
  extension/admin; PG job queue + workers; MV3 extension (popup, background, marketplace
  adapter with resilient selectors, human-in-the-loop); Next.js dashboard (all core pages);
  unit + integration tests; docker-compose; CI; README.
- **P1:** Playwright E2E in CI; CSV export of analytics; email transport (SMTP); feed
  scheduling UI polish; extension Groups channel assist; bulk photo validation.
- **P2:** multi-feed per source, webhook push sources with HMAC, OpenAI provider fine-tuning
  options, dealership website ingestion adapter interface, audit log export, SSO-ready auth
  abstraction.

---

## 9. Assumptions (documented per instructions)

1. Reference extension uses the user's own FB session → human-in-the-loop design (G1–G3).
2. "DMS integration" generalized to vendor-neutral CSV/JSON-feed/webhook ingestion (DMS
   providers vary; adapters are pluggable).
3. No pricing/billing in MVP (placeholder org settings only).
4. Single-region deployment; files (CSV, photos) referenced by URL — no binary storage in MVP
   beyond configurable upload limits (photos stay at source URLs; extension fetches them).
5. Email delivery is a pluggable transport; default logs. SMTP via env in P1.
6. Facebook DOM structure is unstable → selector adapter treats strategies as data, ships
   fixtures + tests, and reports strategy telemetry so selectors can be updated without code
   changes (config-over-code).
7. Multi-vertical supported via `Organization.vertical`; MVP UI optimizes for automotive while
   schema stays generic (title/specs driven).
