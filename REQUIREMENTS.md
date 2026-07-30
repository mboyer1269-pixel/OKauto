# OKauto — Product Requirements & Architecture

**Product name:** OKauto  
**Reference (clean-room):** Publicly observable capabilities of Shiftly Auto (`shiftlyauto.com`) and comparable marketplace listing tools. No proprietary code, trademarks, or hidden APIs were copied.  
**Date:** 2026-07-30  
**Status:** MVP implementation target

---

## 1. Product summary

OKauto helps dealerships list and manage vehicle inventory on Facebook Marketplace faster and more safely. Salespeople use a Chrome Manifest V3 extension that **assists** listing creation (prefill title, price, description, photos) while keeping a **human in the loop**. Managers use a dealer dashboard for inventory, team analytics, sold/price-change alerts, and administration.

**Non-goals / policy constraints**
- Never bypass CAPTCHA, anti-bot protections, authentication, rate limits, or Meta platform restrictions.
- Never automate unattended Marketplace posting; the user must confirm and submit.
- Never scrape authenticated Facebook content without the user’s own session and explicit action.
- No trademarked names/logos from the reference product in UI.

---

## 2. Verified reference capabilities (public sources)

| Capability | Evidence | OKauto approach |
|---|---|---|
| Chrome extension for Marketplace posting | Marketing pages, competitor comparisons | MV3 extension: assistive prefill + checklist |
| Inventory from DMS / website | “pulls VIN, photos, pricing from DMS or website” | CSV/XML feeds + website URL import job + manual entry |
| ~60s per unit listing assist | Marketing claims | One-click “Prepare listing” from inventory |
| AI / SEO descriptions | Marketing + competitor feature matrices | LLM provider with deterministic template fallback |
| Dealer dashboard | Explicit product pillar | Next.js app with RBAC |
| Per-salesperson listing tracking | Explicit | Listing events + analytics APIs |
| Sold vehicle alerts | Explicit AI alerts | Inventory sync detects sold/missing + notify |
| Verticals: auto, RV, marine, powersports | Lead form / marketing | `vehicleType` enum + flexible attributes |
| Training/ads agency services | Marketing | Out of scope for MVP (docs only) |

### Assumptions (documented)

1. Marketplace posting remains **assisted**, not fully unattended automation.
2. “Sold detection” compares dealership inventory feeds / website sync against active listings; optional manual mark-sold.
3. VIN decode uses a pluggable provider; MVP ships an offline NHTSA-compatible decoder stub + basic WMI heuristics with optional HTTP decode.
4. Multi-dealership organizations are first-class.
5. Demo mode runs fully offline with seed data and mock AI.

---

## 3. User roles & stories

### Roles
| Role | Permissions |
|---|---|
| `owner` | Full org control, billing placeholders, delete org |
| `admin` | Manage users, inventory sources, settings, audit |
| `manager` | View analytics, manage inventory, assign listings |
| `salesperson` | View assigned inventory, prepare/list, acknowledge alerts |
| `viewer` | Read-only dashboard |

### Core user stories & acceptance criteria

**US-1 Onboarding**  
As an owner, I can create an organization, invite users, and connect an inventory source.  
AC: Org created; invite email/token works; CSV import succeeds with validation report.

**US-2 Inventory sync**  
As an admin, I can import vehicles via CSV/XML or website URL and see sync health.  
AC: Duplicates by VIN prevented; sync job status visible; failures recoverable.

**US-3 Prepare listing**  
As a salesperson, I can open a vehicle and generate a Marketplace-ready payload (title, price, description, photos).  
AC: Description generated; photos ordered; payload downloadable by extension.

**US-4 Extension assist**  
As a salesperson on Marketplace create-listing, the extension fills fields I approve.  
AC: Works on known Marketplace create URLs; never submits without user action; logs listing attempt.

**US-5 Sold / price alerts**  
As a salesperson, I get notified when a vehicle I listed is sold or price-changed.  
AC: Notification created; dashboard badge; extension badge optional.

**US-6 Manager analytics**  
As a manager, I see listings per salesperson, active listings, and recent activity.  
AC: Filters by date/user; export CSV; accurate counts from audit events.

**US-7 Audit & admin**  
As an admin, I can review audit logs and revoke API/extension tokens.  
AC: Immutable audit entries for auth, inventory, listing, settings changes.

---

## 4. Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Chrome MV3     │────▶│  API (Fastify)   │◀────│  Next.js Web    │
│  Extension      │     │  /v1/*           │     │  Dashboard      │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              PostgreSQL      Redis       Worker
              (Prisma)       (BullMQ)   (sync, AI, alerts)
```

**Stack**
- TypeScript everywhere
- `apps/web` — Next.js 15 (App Router)
- `apps/api` — Fastify + Zod
- `apps/worker` — BullMQ processors
- `apps/extension` — Chrome Manifest V3
- `packages/shared` — types, validators, constants
- PostgreSQL 16 + Prisma
- Redis 7 + BullMQ
- Docker Compose for local/prod-like
- Vitest + Playwright for tests
- GitHub Actions CI

---

## 5. Database schema (logical)

- `organizations` — dealerships / rooftops group
- `dealerships` — rooftop, timezone, address, website
- `users` — email, password hash, name
- `memberships` — user↔org/dealership + role
- `invites` — tokenized invitations
- `refresh_tokens` / `api_tokens` — sessions & extension tokens
- `inventory_sources` — csv|xml|website|manual, config, last sync
- `sync_runs` — status, stats, errors
- `vehicles` — VIN, stock#, year/make/model/trim, price, mileage, status, attrs JSON
- `vehicle_media` — url, sort, checksum
- `listings` — vehicle, salesperson, platform=facebook_marketplace, status, external refs
- `listing_events` — prepared|filled|submitted|removed|sold_detected|price_changed
- `notifications` — type, payload, readAt
- `audit_logs` — actor, action, entity, meta
- `description_generations` — prompt/response metadata (no secrets)

See Prisma schema for exact columns and indexes.

---

## 6. API contracts (v1 overview)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/v1/auth/register` | public | create owner + org |
| POST | `/v1/auth/login` | public | access + refresh |
| POST | `/v1/auth/refresh` | public | rotate refresh |
| POST | `/v1/auth/logout` | auth | revoke refresh |
| GET | `/v1/me` | auth | profile + memberships |
| CRUD | `/v1/dealerships` | admin+ | rooftops |
| CRUD | `/v1/members` / invites | admin+ | RBAC |
| CRUD | `/v1/inventory/sources` | admin+ | feeds |
| POST | `/v1/inventory/sources/:id/sync` | admin+ | enqueue sync |
| GET | `/v1/vehicles` | member | filter/search |
| POST | `/v1/vehicles` | manager+ | manual |
| POST | `/v1/vehicles/:id/descriptions` | member | AI generate |
| POST | `/v1/vehicles/:id/prepare-listing` | member | create listing draft |
| GET/PATCH | `/v1/listings` | member | status updates from extension |
| POST | `/v1/listings/:id/events` | member | extension telemetry |
| GET | `/v1/analytics/summary` | manager+ | KPIs |
| GET | `/v1/notifications` | member | inbox |
| GET | `/v1/audit-logs` | admin+ | audit |
| GET | `/v1/health` | public | liveness |

All mutating routes write audit logs. IDs are UUIDs. Errors use `{ error: { code, message, details? } }`.

---

## 7. Extension behavior (MV3)

1. User signs in with API token / email+password → stores access token in `chrome.storage.session`.
2. Side panel lists dealership inventory (search by VIN/stock).
3. “Prepare listing” fetches payload; opens Marketplace create page (user-initiated).
4. Content script uses resilient selectors + adapters; fills fields when user clicks **Fill form**.
5. Photos: user downloads zip or copies URLs; extension assists upload where DOM allows without bypassing protections.
6. On user submit (observed via page signals / manual confirm), extension posts `submitted` event.
7. Background SW polls notifications for sold/price alerts (respectful interval + backoff).

**Safety:** no CAPTCHA solve, no credential stuffing, no stealth evasion, rate-limited API calls.

---

## 8. Phased implementation

| Phase | Scope |
|---|---|
| P0 | Monorepo, schema, auth, RBAC, seed, health |
| P1 | Inventory import (CSV/XML), vehicles CRUD, media |
| P2 | AI descriptions, prepare listing, listing events |
| P3 | Web dashboard (inventory, analytics, alerts, admin) |
| P4 | Chrome extension (auth, inventory, fill assist) |
| P5 | Worker jobs: sync, sold detection, notifications |
| P6 | Tests, CI, Docker, observability, README |

MVP = P0–P6 runnable locally via Docker Compose.

---

## 9. Improvements beyond reference

- Duplicate VIN prevention with merge strategies
- Sync health dashboard + dead-letter visibility
- Bulk actions (status, assign, regenerate descriptions)
- Resilient Marketplace DOM adapters versioned by adapter pack
- Structured logging + request IDs + metrics endpoint
- Accessibility (WCAG-minded forms, keyboard nav)
- Mobile-responsive dashboard
- Clear recovery UX for failed syncs and expired tokens
- Human-in-the-loop posting (policy-safe)

---

## 10. Security

- Argon2id password hashing
- JWT access (short TTL) + rotating refresh tokens
- Extension tokens scoped per user/org, revocable
- Zod validation on all inputs
- Helmet, CORS allowlist, rate limiting
- No secrets in repo; `.env.example` only
- Audit trail for privileged actions
- CSP-friendly Next.js defaults

---

## 11. Success criteria for MVP

1. `docker compose up` boots API, web, worker, Postgres, Redis.
2. Seed users can log into dashboard and browse inventory.
3. CSV import creates vehicles; AI description generates text.
4. Extension loads unpacked and authenticates against local API.
5. Unit + integration tests pass in CI; Playwright smoke against web.
6. README documents setup, architecture, and policy stance.
