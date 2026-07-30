# OKauto — Requirements & Architecture

**Product:** OKauto — clean-room dealership listing platform for Facebook Marketplace  
**Reference:** Publicly observable capabilities of Shiftly Auto (shiftlyauto.com) and related public materials  
**Constraint:** No proprietary source, trademarks, protected assets, or hidden APIs. Human-in-the-loop Marketplace posting only. Never bypass CAPTCHA, auth, rate limits, or platform anti-bot controls.

---

## 1. Verified Reference Capabilities (Public)

| Capability | Evidence | OKauto Implementation |
|---|---|---|
| Chrome extension for FB Marketplace / Groups posting | Chrome Web Store listing “Shiftly Auto Lister”; marketing “~60s per unit” | MV3 extension: assistive form-fill, human confirm/submit |
| Pull VIN, photos, pricing from DMS / website | Homepage / software pages | CSV/XML feed import + website inventory adapter + manual entry |
| Ready-to-post descriptions | Marketing copy | AI-assisted + template fallback, compliance checklist |
| Dealer dashboard / salesperson tracking | FAQ + software page | Org dashboard, RBAC, per-user listing analytics |
| Sold-vehicle alerts | AI alerts section | Inventory delta detection → in-app + email notifications |
| Multi-vertical (auto, RV, marine, etc.) | Lead form niches | `VehicleCategory` enum; automotive-first MVP with extensible schema |
| Inventory management portal | Software page | CRUD, filters, bulk actions, sync health |
| Training / ads services | Marketing (agency) | Out of scope for software MVP (documented as future) |

### Explicit non-goals (MVP)
- Automated CAPTCHA solving or auth bypass
- Headless unattended Facebook posting
- Cloning Shiftly branding, copy, or closed APIs
- Paid ads management agency workflow

---

## 2. Assumptions

1. **Marketplace posting is assistive:** the extension prefills fields the user can see; the user completes any challenges and clicks Publish.
2. **Inventory truth source:** dealership CSV/XML feeds or website VDP pages are the primary sources; sold/price changes come from feed re-sync, not Facebook scraping of private data.
3. **Organizations = dealerships;** multi-user with RBAC.
4. **Auth:** email/password + session cookies; extension uses short-lived API tokens scoped to org/user.
5. **AI descriptions:** optional OpenAI-compatible API; deterministic template engine when no key is configured.
6. **Compliance:** store only data the dealer owns or has rights to; audit sensitive actions.
7. **Stack:** TypeScript, Next.js App Router, Prisma/PostgreSQL, BullMQ/Redis, Chrome MV3, Vitest + Playwright.

---

## 3. User Roles & Stories

### Roles
| Role | Permissions |
|---|---|
| `OWNER` | Billing (future), org settings, all admin |
| `ADMIN` | Users, inventory sources, settings, all listings |
| `MANAGER` | Inventory, analytics, approve listings, notifications |
| `SALESPERSON` | View inventory, create assisted listings, own analytics |

### Epic stories (acceptance criteria summarized)

**US-01 Auth & onboarding**  
As a dealer owner, I can register, create a dealership org, invite staff, and install the extension.  
*AC:* signup → org created → invite email/link → member joins with role; demo seed works offline.

**US-02 Inventory import**  
As a manager, I can upload CSV or configure a feed URL and see normalized vehicles.  
*AC:* VIN/stock uniqueness; photos linked; sync job status visible; duplicates skipped/merged.

**US-03 AI description**  
As a salesperson, I can generate a Marketplace-ready description and edit it before listing.  
*AC:* works without API key (template); with key uses AI; length/banned-phrase checks.

**US-04 Assisted Marketplace listing**  
As a salesperson, from the extension I select a vehicle, open Marketplace create flow, get fields filled, confirm, publish myself, and OKauto records the listing.  
*AC:* never auto-solves CAPTCHA; records status `ASSISTED` → `PUBLISHED` or `FAILED`; duplicate prevention if already active.

**US-05 Dealer dashboard**  
As a manager, I see inventory counts, listing activity by salesperson, sync health, and recent alerts.  
*AC:* mobile-responsive; accessible landmarks; filters by date/user/status.

**US-06 Sold / price-change alerts**  
When inventory sync marks a vehicle sold or price-changed, notify assigned listers.  
*AC:* notification created; listing flagged `NEEDS_REMOVAL` or `PRICE_STALE`.

**US-07 Audit & admin**  
Admins can view audit logs for invites, role changes, imports, listing state changes.

---

## 4. Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Chrome MV3 Ext  │────▶│ Next.js Web/API  │────▶│ PostgreSQL      │
│ (assistive UI)  │     │ Auth + Dashboard │     │ Prisma ORM      │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Worker (BullMQ)  │──▶ Redis
                        │ sync, notify, AI │
                        └──────────────────┘
```

### Packages
- `apps/web` — Next.js dashboard + REST API (`/api/v1/*`)
- `apps/extension` — Manifest V3 TypeScript extension
- `apps/worker` — background processors
- `packages/db` — Prisma schema, client, seed
- `packages/shared` — Zod schemas, constants, RBAC helpers

### Security
- Argon2id password hashing
- HTTP-only secure session cookies (web)
- Extension bearer tokens (hashed at rest, rotatable)
- RBAC middleware on every API route
- Rate limiting on auth + AI endpoints
- CSP-friendly extension; minimal host permissions (`facebook.com` + API origin)
- No secrets in client bundles

---

## 5. Database Schema (logical)

- `User` — id, email, name, passwordHash, createdAt
- `Organization` — id, name, slug, timezone, settings JSON
- `Membership` — userId, orgId, role, status
- `Invite` — email, orgId, role, tokenHash, expiresAt
- `InventorySource` — orgId, type (CSV_UPLOAD|FEED_URL|MANUAL|WEBSITE), config, lastSyncAt, health
- `Vehicle` — orgId, vin, stockNumber, year, make, model, trim, priceCents, mileage, status, category, attributes JSON, contentHash
- `VehicleMedia` — vehicleId, url, sortOrder, kind
- `Listing` — vehicleId, userId, platform, externalUrl, status, title, description, priceCents, postedAt
- `ListingEvent` — listingId, type, payload, actorId
- `Notification` — userId, orgId, type, title, body, readAt, meta
- `ExtensionToken` — userId, orgId, tokenHash, label, lastUsedAt, revokedAt
- `AuditLog` — orgId, actorId, action, entityType, entityId, meta
- `JobRun` — type, status, orgId, startedAt, finishedAt, error, stats
- `DescriptionCache` — vehicleId, promptHash, body, provider

---

## 6. API Contracts (v1)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/register` | Create user + org |
| POST | `/api/v1/auth/login` | Session |
| POST | `/api/v1/auth/logout` | |
| GET | `/api/v1/me` | Current user + memberships |
| GET/PATCH | `/api/v1/org` | Org settings |
| GET/POST | `/api/v1/members` | List/invite |
| GET/POST | `/api/v1/vehicles` | Inventory |
| POST | `/api/v1/vehicles/import` | CSV import |
| POST | `/api/v1/vehicles/:id/describe` | AI/template description |
| GET/POST | `/api/v1/listings` | Listing history / start assist |
| PATCH | `/api/v1/listings/:id` | Status updates from extension |
| GET | `/api/v1/analytics/overview` | Dashboard KPIs |
| GET/POST | `/api/v1/notifications` | Alerts |
| POST | `/api/v1/extension/token` | Issue extension token |
| GET | `/api/v1/extension/vehicles` | Vehicles ready to list |
| GET | `/api/v1/audit` | Admin audit trail |
| GET | `/api/v1/health` | Liveness + dependency checks |

---

## 7. Extension Behavior

1. Popup: login via API token / session link; show org + ready vehicles.
2. Content script (facebook.com only): detect Marketplace create listing UI via resilient adapter selectors (multi-strategy: aria, label text, placeholder, role).
3. On “Assist fill”: inject title, price, description, condition, vehicle fields; queue photo download instructions for user confirmation.
4. Detect CAPTCHA / checkpoint → pause and surface “Complete Facebook challenge, then continue”.
5. On user publish confirmation (observed navigation or explicit “Mark published”), PATCH listing status.
6. Background service worker: token refresh, notification badge for `NEEDS_REMOVAL`.

---

## 8. Phased Implementation Plan

| Phase | Scope | Status |
|---|---|---|
| P0 | Monorepo, schema, auth, seed, health | This MVP |
| P1 | Inventory CRUD/import, dashboard, analytics | This MVP |
| P2 | Extension assistive fill + listing workflow | This MVP |
| P3 | Worker sync, sold/price alerts, notifications | This MVP |
| P4 | AI descriptions, audit, CI/CD, Docker, tests | This MVP |
| P5 | Multi-source website adapters, billing, multi-marketplace | Future |

---

## 9. Observability & Ops

- Structured JSON logs (`pino`)
- `/api/v1/health` checks DB + Redis
- Job run history in DB
- GitHub Actions: lint, typecheck, unit, build
- Docker Compose: web, worker, postgres, redis
- `.env.example` for all secrets

---

## 10. Success Criteria (MVP Definition of Done)

1. `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` runs web + worker.
2. Demo dealer can log in, browse inventory, generate description, create listing assist record.
3. Extension loads unpacked and authenticates against local API.
4. Sync job marks sold vehicle and creates notification.
5. Lint, typecheck, unit tests, and production build pass in CI.
6. README documents setup, policies, and architecture.
