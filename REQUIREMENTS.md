# OpenLot — Requirements & Architecture

OpenLot is a **clean-room, production-grade alternative** to commercial dealer-listing tools such as Shiftly Auto. It was built solely from **publicly observable product behavior** (marketing pages, public Chrome Web Store metadata, public FAQs). No proprietary source code, trademarks, protected assets, or hidden APIs were copied or accessed.

---

## 1. Product reconnaissance (verified public capabilities of the reference product)

| # | Observed capability | Public source |
|---|---------------------|---------------|
| R1 | Chrome extension that posts dealership vehicles to Facebook Marketplace "in about 60 seconds" | shiftlyauto.com landing + /software |
| R2 | Pulls VIN data, photos and pricing "straight from your DMS (or website)" | shiftlyauto.com landing |
| R3 | Generates "compliant descriptions ready-to-post" | shiftlyauto.com landing |
| R4 | Dealer dashboard portal with real-time per-salesperson listing counts ("track how many listings each salesperson has posted") | /dealership-listing-tool |
| R5 | "AI alerts" that notify salespeople in real time when a posted vehicle is sold, prompting listing removal | /software, FAQ |
| R6 | Inventory managed from one dashboard: track, update, manage every listing; active vs sold | /software |
| R7 | Extension (MV3) uses `storage`, `tabs`, `sidePanel`, `unlimitedStorage` permissions and content scripts on `www.facebook.com` / `web.facebook.com` | Chrome Web Store metadata (chrome-stats mirror) |
| R8 | Serves multiple verticals (auto, RV, marine, trailers, equipment, furniture) | /facebook-listing-tool |
| R9 | Salespeople post listings from their own Facebook accounts (personal-account Marketplace listings; the dealer tracks activity) | case studies, FAQ |

**Interpretation.** The product is three cooperating parts: (a) an inventory backend fed by DMS/website exports, (b) a manager dashboard for accountability and sold alerts, and (c) a Chrome extension that accelerates a *human-driven* Marketplace listing flow. OpenLot reproduces those capabilities independently and improves on them (see §7).

## 2. Assumptions (chosen safest-scalable, documented)

- **A1 — Human-in-the-loop publishing.** Facebook ToS and Chrome Web Store policy prohibit automated posting that bypasses platform controls. OpenLot's extension *pre-fills* the Marketplace form from vehicle data on explicit user click; the salesperson reviews, adds photos, and clicks Facebook's own Publish button. The extension never auto-submits, never touches CAPTCHAs/anti-bot systems, and records lifecycle events only when the user confirms them.
- **A2 — Sold detection via inventory diffing.** "AI alerts when a vehicle sells" is implemented as source-of-truth diffing: when a vehicle disappears from the dealer's full-inventory feed/CSV (or is manually marked sold), alert jobs notify every salesperson with a live listing for it. This is deterministic, explainable, and does not scrape Facebook.
- **A3 — Multi-tenancy.** One platform instance serves many dealerships (organizations) with per-org RBAC: OWNER > MANAGER > SALESPERSON, plus a cross-tenant platform-admin flag.
- **A4 — Photos by URL.** Feeds/CSVs supply photo URLs; the extension surfaces them for quick download/upload. Programmatic file injection into Facebook's uploader is deliberately avoided (fragile + policy risk).
- **A5 — AI descriptions are optional and grounded.** With an OpenAI-compatible key the API uses an LLM constrained to a fact sheet ("never invent specs"); without a key a deterministic template generator produces equivalent compliant copy. Both paths are auditable via `descriptionSource`.
- **A6 — Prices are stored as integer cents (USD)** to avoid float drift; mileage as integers.
- **A7 — Extension tokens** are stored in `chrome.storage.local` (access + rotating refresh token); the dashboard keeps access tokens in memory with an httpOnly refresh cookie.

## 3. User stories & acceptance criteria (implemented ✅ / tested 🧪)

### Identity & tenancy
- **US-1** As a dealer principal I can register, create my dealership, and become its OWNER. ✅🧪
  - AC: password ≥10 chars with letter+digit; duplicate email → 409; creator gets OWNER membership; audit entry written.
- **US-2** As an OWNER/MANAGER I can invite teammates by email with a role; invitees join via token. ✅🧪
  - AC: invite expires in 14 days; only OWNER can invite OWNER; accepting an invite issued to a different email → 403.
- **US-3** As any user I stay signed in via refresh-token rotation; reuse of a rotated token is rejected; password change revokes all sessions. ✅🧪

### Inventory
- **US-4** As a MANAGER I can import a DMS/website CSV export; rows are normalized (VIN, price "$8,995", miles "88,412", body "Crew Cab Pickup" → TRUCK…), deduplicated by VIN, and row-level errors are reported without failing the batch. ✅🧪
- **US-5** As a MANAGER I can connect CSV/JSON URL feeds with a sync interval; the scheduler runs them, dedupes queued syncs per feed, records sync-run stats, and marks the feed FAILED with retry/backoff on errors. ✅🧪
- **US-6** As the system, when a vehicle disappears from a full-inventory source I mark it SOLD and alert every holder of a live listing; if it reappears I restore it to AVAILABLE. ✅🧪
- **US-7** As a user I can add vehicles manually with VIN check-digit validation and NHTSA vPIC enrichment (offline fallback included). ✅🧪
- **US-8** As a MANAGER I can bulk mark sold/available, archive, and queue description generation. ✅🧪
- **US-9** Price changes create price-history entries and alert active listers. ✅🧪

### Listings (extension + dashboard)
- **US-10** As a SALESPERSON I browse available inventory in the extension side panel and click "List on Marketplace"; a listing intent is created (duplicate-prevented per user+vehicle) and the Marketplace form opens with an overlay. ✅🧪 (API + extension)
- **US-11** As a SALESPERSON I click "Auto-fill form"; fields are filled via resilient label-based adapters; unfillable fields are itemized for manual entry; a PREPARED event is recorded. ✅
- **US-12** As a SALESPERSON I confirm "I published it"; the listing becomes ACTIVE with the Marketplace URL captured when available. ✅🧪 (API)
- **US-13** As a SALESPERSON I receive sold/price-change alerts (dashboard + extension badge) and can record listing REMOVED. ✅🧪
- **US-14** Full listing event history (NOTE/PREPARED/PUBLISHED/RENEWED/REMOVED/FAILED) is preserved and drives status transitions. ✅🧪

### Management & administration
- **US-15** As a MANAGER I see org KPIs (available, active listings, published-7d, sold-30d, avg price) and a 30-day activity chart. ✅🧪
- **US-16** As a MANAGER I see per-salesperson totals: active, published 7/30 days, last activity. Salespeople cannot access this. ✅🧪
- **US-17** As a MANAGER I can review sync health (runs, stats, per-row errors) and the org audit log. ✅🧪
- **US-18** As a PLATFORM ADMIN I can list orgs/users, disable accounts, inspect the job queue and retry dead jobs. ✅🧪
- **US-19** Cross-tenant access is denied everywhere (org-scoped middleware). ✅🧪

## 4. Architecture

```
apps/web (Next.js 15)  ──►  apps/api (Fastify 5, Node 22)  ──►  PostgreSQL 16
apps/extension (MV3)   ──►       │  REST /api/v1                (Drizzle ORM, SQL migrations)
                                 ├─ inline or dedicated worker: Postgres-backed job queue
                                 │    (FOR UPDATE SKIP LOCKED, backoff retries, dead-letter, dedupe keys)
                                 ├─ AI service (OpenAI-compatible, template fallback)
                                 └─ NHTSA vPIC VIN decoder (offline fallback)
packages/shared: zod schemas, VIN/CSV utilities, normalizers, description generator, Marketplace field mapping
```

- **Monorepo:** pnpm workspaces; strict TypeScript everywhere; single ESLint flat config.
- **Auth:** scrypt password hashes (Node crypto); HS256 JWT access tokens (15 min); opaque SHA-256-hashed refresh tokens with rotation; httpOnly cookie for web, storage for extension.
- **RBAC:** per-org membership roles with rank check + platform-admin override; enforced in a single `requireMembership` helper.
- **Jobs:** `jobs` table claimed with `FOR UPDATE SKIP LOCKED` (multi-worker safe); exponential backoff (2s → 1h cap); `maxAttempts` then DEAD; `dedupeKey` prevents duplicate pending work (one sync per feed). Job types: `feed_sync`, `sold_alerts`, `price_change_alerts`, `generate_description`, `stale_listing_scan`, `feed_schedule_tick`.
- **Observability:** pino structured logs, `/healthz`, `/readyz` (DB ping + queue depth), audit log, sync-run reports, admin queue inspection.
- **Security:** helmet headers, CORS allow-list (+ `chrome-extension://` origins), global + per-route rate limits (login 15/min), zod validation on every input, uniform error envelope, no user enumeration on login, soft-delete archives, IP-stamped audit entries.
- **Testing strategy:** the API test harness runs the *production SQL migrations* against embedded Postgres (PGlite) and exercises the real HTTP interface — unit, integration and an end-to-end business-journey suite run in CI with zero external services.

## 5. Database schema (PostgreSQL, see `apps/api/src/db/schema.ts` + `apps/api/drizzle/`)

| Table | Purpose / key columns |
|---|---|
| `users` | email (unique), name, scrypt hash, `is_platform_admin`, `disabled_at` |
| `organizations` | name, slug (unique), contact/address, `settings` jsonb (tone, disclaimer, staleListingDays) |
| `org_memberships` | (org, user) unique, role OWNER/MANAGER/SALESPERSON |
| `invites` | email, role, token (unique), expiry, accepted_at |
| `refresh_tokens` | sha256 token hash (unique), client, expiry, revoked_at |
| `vehicles` | (org, vin) unique; year/make/model/trim, body/condition/mileage, `price_cents`, colors, powertrain, `features` jsonb, `photo_urls` jsonb, status AVAILABLE/PENDING/SOLD/ARCHIVED, source MANUAL/CSV/FEED, `description_source`, seen/sold timestamps |
| `price_history` | vehicle, price_cents, source, recorded_at |
| `feed_sources` | org, CSV_URL/JSON_URL, url, interval, `mark_missing_as_sold`, active, last run/status |
| `sync_runs` | org, feed?, trigger MANUAL/SCHEDULED/CSV, status, `stats` jsonb (created/updated/markedSold/priceChanges/errors[]) |
| `listings` | org, vehicle, user, channel, status DRAFT/PREPARED/ACTIVE/ENDED/REMOVED/FAILED, remote_url, prepared/published/ended timestamps |
| `listing_events` | listing, actor, type, message, meta |
| `notifications` | org, user, type (VEHICLE_SOLD, PRICE_CHANGED, SYNC_FAILED, LISTING_STALE, …), title/body/meta, read_at |
| `audit_logs` | org?, actor?, action, entity type/id, meta, ip |
| `jobs` | type, payload, status PENDING/RUNNING/SUCCEEDED/FAILED/DEAD, run_at, attempts/max, dedupe_key |

## 6. API contract (REST, JSON, `/api/v1`, Bearer auth unless noted)

Errors: `{ "error": { "code", "message", "details?" } }` — 401/403/404/409/422/429 semantics as documented per route. Lists are paginated `{ items, page, pageSize, total }`.

| Method & path | Role | Purpose |
|---|---|---|
| POST `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | public | Session lifecycle (refresh rotates; cookie or body token) |
| GET/PATCH `/auth/me` | user | Profile, password change (revokes sessions) |
| POST `/auth/invites/accept` | user | Join org by invite token |
| POST `/orgs` | user | Create dealership (becomes OWNER) |
| GET/PATCH `/orgs/:orgId` | member / MANAGER | Org profile + settings |
| GET `/orgs/:orgId/members` · PATCH/DELETE `/members/:userId` | member / OWNER | Roster & role management (last-owner protection) |
| POST/GET/DELETE `/orgs/:orgId/invites[/:id]` | MANAGER | Invite management |
| POST `/vin/decode` | public | VIN validation + NHTSA enrichment |
| GET/POST `/orgs/:orgId/vehicles` | member | Search/filter/sort/paginate; create with VIN validation |
| GET/PATCH/DELETE `/orgs/:orgId/vehicles/:id` | member / MANAGER(delete=archive) | Detail (+price history, listings), update, archive |
| POST `/orgs/:orgId/vehicles/bulk` | MANAGER | MARK_SOLD / MARK_AVAILABLE / ARCHIVE / GENERATE_DESCRIPTIONS |
| POST `/orgs/:orgId/vehicles/:id/generate-description` | member | Synchronous AI/template description |
| GET `/orgs/:orgId/vehicles/:id/marketplace-draft` | member | Field payload for the extension form-fill |
| POST `/orgs/:orgId/imports/csv` | MANAGER | Import with full per-row report |
| POST/GET/PATCH/DELETE `/orgs/:orgId/feeds[/:id]` | MANAGER | Feed sources |
| POST `/orgs/:orgId/feeds/:id/sync` | MANAGER | Queue manual sync (202, deduped) |
| GET `/orgs/:orgId/sync-runs` | member | Sync health |
| POST/GET `/orgs/:orgId/listings` | member | Create intent (409 + existing id on duplicate); list w/ filters |
| GET/DELETE `/orgs/:orgId/listings/:id` | member | Detail + events; cancel non-active |
| POST `/orgs/:orgId/listings/:id/events` | member (own) / MANAGER | Record lifecycle event → status transition |
| GET `/notifications` · `/unread-count` · POST `/:id/read` · `/read-all` | user | Alert center |
| GET `/orgs/:orgId/analytics/overview` · `/activity` | member | KPIs, 30-day publish counts |
| GET `/orgs/:orgId/analytics/salespeople` | MANAGER | Per-salesperson accountability |
| GET `/orgs/:orgId/audit-logs` | MANAGER | Filterable audit trail |
| GET `/admin/orgs` · `/admin/users` · `/admin/jobs` · POST `/admin/users/:id/(disable|enable)` · `/admin/jobs/:id/retry` | platform admin | Cross-tenant administration & queue ops |
| GET `/healthz` · `/readyz` | public | Liveness / readiness (DB + queue depth) |

## 7. Improvements over the reference experience

1. **Resilient selector adapters** — the extension locates Marketplace fields by visible labels/ARIA (multiple candidates per field, shared versioned label mapping), reports exactly which fields need manual attention instead of failing silently.
2. **Duplicate prevention** — one live listing per user+vehicle enforced server-side (409 returns the existing listing id so the flow can resume it).
3. **Sync health page** — every run's created/updated/sold/price-change counts and per-row errors are visible; feeds show last status; failures retry with backoff and land in a dead-letter queue with admin retry.
4. **Restore-on-reappear** — vehicles auto-marked sold return to AVAILABLE if the feed lists them again (guards against truncated exports).
5. **Bulk actions, audit log, stale-listing reminders, price-change alerts** — none of which are advertised by the reference product.
6. **Accessibility & mobile** — semantic tables, aria labels, focus-visible controls, keyboard-dismissable modals, responsive sidebar layout.
7. **Compliance by construction** — no auto-publish, no CAPTCHA/anti-bot interference, minimal extension permissions (verified by test), explicit in-UI messaging that the human publishes.

## 8. Phased implementation plan (status)

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo scaffold, CI, lint/typecheck baseline | ✅ |
| 1 | Shared domain package (VIN, CSV, normalization, descriptions, Marketplace mapping) + unit tests | ✅ |
| 2 | API core: schema/migrations, auth + refresh rotation, RBAC, orgs/invites | ✅ |
| 3 | Inventory: CRUD, CSV import, feeds, sync engine, sold/price detection, VIN decode | ✅ |
| 4 | Listings lifecycle + notifications + analytics + audit + admin + job queue/workers | ✅ |
| 5 | Dashboard (all pages) | ✅ |
| 6 | Chrome MV3 extension (popup, side panel, background, content adapter) | ✅ |
| 7 | Ops: Docker, compose, seeds, env templates, CI, docs | ✅ |
| 8 | Future: photo asset pipeline (S3 + resize), webhooks, email/SMS alert channels, Playwright UI E2E, multi-marketplace adapters (OfferUp/Craigslist), DMS-native connectors, i18n | ▢ backlog |

## 9. Policy & legal guardrails

- The extension acts only on explicit user gestures; publishing is always done by the human on Facebook's own UI.
- No scraping of Facebook data; the only Facebook-page interaction is filling the user's own listing form with the dealer's own inventory data.
- No circumvention of CAPTCHA, rate limits, authentication or anti-automation measures — and no permissions (`scripting`, `webRequest`, `cookies`, `debugger`) that would enable covert automation (enforced by unit test).
- "Shiftly", "Shiftly Auto" and Facebook/Meta names are referenced solely for identification. OpenLot ships under its own name with original code and assets.
