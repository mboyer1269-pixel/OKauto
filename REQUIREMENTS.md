# OKauto — Requirements & Architecture

**Product name:** OKauto  
**Positioning:** Clean-room, production-grade dealership inventory listing platform for Facebook Marketplace (and Groups), inspired by publicly observable capabilities of Shiftly Auto — without copying proprietary code, trademarks, assets, or private APIs.

**Reference (public only):** https://shiftlyauto.com/ and the Chrome Web Store listing for “Shiftly Auto Dealer Lister”.

---

## 1. Product reconnaissance (verified from public sources)

### 1.1 Core value proposition
Dealership sales teams list vehicles on Facebook Marketplace faster by pulling inventory (VIN, photos, price), generating ready-to-post descriptions, assisting posting via a Chrome extension, tracking salesperson activity on a dealer dashboard, and receiving sold-vehicle alerts so stale listings are removed.

### 1.2 Observed workflows
| Workflow | Public signal | OKauto interpretation |
|---|---|---|
| Inventory ingest | Pulls VIN/photos/pricing from DMS or website | CSV upload + inventory feed URL sync + manual entry |
| Listing assist | Chrome extension posts inventory to Marketplace & Groups | MV3 extension: human-in-the-loop form assist (never bypasses Meta auth/CAPTCHA/rate limits) |
| Descriptions | “SEO-optimized / compliant descriptions” | Template engine + optional AI-assisted generation with human review |
| Dealer dashboard | Track listings per salesperson | Org-scoped analytics, listing history, RBAC |
| Sold alerts | Notify when vehicle sold → remove Marketplace listing | Inventory status change detection + in-app/email notifications |
| Onboarding | Demo / get-started form | Self-serve org signup, invite users, connect inventory, install extension |
| Industries | Auto, RV, marine, mobile homes, real estate, farm, furniture | Primary: automotive; schema supports `category` for future niches |

### 1.3 User roles
| Role | Capabilities |
|---|---|
| `owner` | Full org admin, billing hooks, delete org, all settings |
| `manager` | Manage users (invite/deactivate), inventory, analytics, settings |
| `salesperson` | View assigned/available inventory, create listing drafts, use extension, receive alerts |
| `viewer` | Read-only dashboard & inventory |

### 1.4 Explicit non-goals / policy constraints
- Do **not** bypass CAPTCHA, anti-bot systems, Meta authentication, or platform rate limits.
- Do **not** scrape Facebook Marketplace listing pages without user session / ToS-compliant human action.
- Extension assists a **logged-in human** filling Marketplace create-listing UI; publish requires user confirmation.
- No cloning of Shiftly trademarks, logos, copy, or proprietary APIs.

### 1.5 Improvements over the reference experience
1. AI-assisted descriptions with editable drafts and compliance checklist.
2. Duplicate VIN / stock-number prevention with merge suggestions.
3. Inventory sync health (last sync, failures, retry).
4. Bulk actions (status updates, description regenerate, assign salesperson).
5. Resilient Marketplace DOM adapters with versioned selectors + fallback heuristics.
6. Observability: structured logs, request IDs, job metrics.
7. Accessibility (WCAG 2.1 AA targets) and mobile-responsive dashboard.
8. Clear failure recovery UX (retry, discard draft, re-auth extension).

---

## 2. Assumptions (documented)

1. Primary marketplace target is Facebook Marketplace vehicle category; Groups posting is assisted similarly but optional.
2. VIN decode uses a pluggable provider (NHTSA VPIC free API for MVP; commercial providers later).
3. Media stored as URLs initially (remote inventory photos); local object storage (S3-compatible) optional via env.
4. AI descriptions use OpenAI-compatible API when `OPENAI_API_KEY` is set; otherwise deterministic template fallback.
5. Job queue uses Redis + BullMQ; if Redis unavailable in dev, in-process fallback queue runs.
6. Multi-tenant isolation is organization-scoped; all queries filter by `organizationId`.
7. Email notifications use console/log provider in MVP; SMTP/Resend when configured.
8. Pricing/billing is out of MVP scope (stub admin flag only).

---

## 3. User stories & acceptance criteria

### US-1 Auth & organizations
**As a** dealership owner, **I want** to sign up and create an organization **so that** my team can collaborate.  
**AC:** Email/password signup; JWT session; org created; owner role assigned; login/logout works.

### US-2 RBAC invites
**As a** manager, **I want** to invite salespeople **so that** they can list inventory.  
**AC:** Invite by email+role; accept creates membership; permissions enforced on API.

### US-3 Inventory import
**As a** manager, **I want** to import vehicles via CSV **so that** the team has inventory to list.  
**AC:** CSV with VIN/year/make/model/price/mileage/photos; duplicates detected by VIN; sync job status visible.

### US-4 Feed sync
**As a** manager, **I want** to configure an inventory feed URL **so that** stock stays current.  
**AC:** Feed config stored; worker fetches periodically; sold/price changes detected; sync health shown.

### US-5 AI descriptions
**As a** salesperson, **I want** generated listing copy **so that** I can post faster.  
**AC:** Generate endpoint returns draft; user can edit/save; no publish without review flag.

### US-6 Extension listing assist
**As a** salesperson, **I want** the extension to fill Marketplace fields from OKauto inventory **so that** posting takes ~60 seconds of human confirmation.  
**AC:** Auth to API; pick vehicle; on Marketplace create page, fill title/price/description/photos guidance; user must click Publish; CAPTCHA untouched.

### US-7 Dashboard analytics
**As a** manager, **I want** listings-per-salesperson metrics **so that** I can coach the team.  
**AC:** Charts/tables for listing counts, active/sold, activity timeline.

### US-8 Sold alerts
**As a** salesperson, **I want** alerts when a listed vehicle is marked sold **so that** I remove the Marketplace listing.  
**AC:** Status→sold creates notification; appears in UI; optional email.

### US-9 Audit log
**As an** owner, **I want** an audit trail of sensitive actions **so that** we can investigate issues.  
**AC:** Auth, invite, inventory mutations, listing events recorded with actor + timestamp.

---

## 4. Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Chrome Ext MV3 │────▶│  API (Fastify)   │────▶│  PostgreSQL     │
│  popup + content│     │  /v1/*           │     │  Prisma ORM     │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
┌─────────────────┐              │               ┌─────────────────┐
│  Web (Next.js)  │──────────────┤               │  Redis/BullMQ   │
│  dealer dashboard│             │               │  workers        │
└─────────────────┘              └──────────────▶└─────────────────┘
```

### Packages (pnpm monorepo)
- `apps/api` — Fastify REST API, auth, RBAC, inventory, listings, notifications
- `apps/web` — Next.js App Router dealer dashboard
- `apps/worker` — BullMQ processors (feed sync, alerts, description jobs)
- `apps/extension` — Chrome Manifest V3 listing assistant
- `packages/db` — Prisma schema, migrations, seed
- `packages/shared` — Zod schemas, types, RBAC helpers, VIN utils

---

## 5. Database schema (summary)

- `User` — id, email, passwordHash, name, createdAt
- `Organization` — id, name, slug, settings JSON
- `Membership` — userId, organizationId, role, status
- `Invite` — email, orgId, role, token, expiresAt
- `Vehicle` — orgId, vin, stockNumber, year, make, model, trim, price, mileage, status, photos[], description, attributes JSON
- `InventorySource` — orgId, type (csv|feed|manual), config, lastSyncAt, lastError, health
- `Listing` — vehicleId, userId, orgId, channel (marketplace|group), status, externalRef, payload, postedAt
- `ListingEvent` — listingId, type, meta, createdAt
- `Notification` — userId, orgId, type, title, body, readAt, meta
- `AuditLog` — orgId, actorId, action, entity, entityId, meta, createdAt
- `Session` / refresh tokens as needed

---

## 6. API contracts (v1 sketch)

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/register` | Create user + org |
| POST | `/v1/auth/login` | JWT access + refresh |
| GET | `/v1/me` | Current user + memberships |
| GET/PATCH | `/v1/orgs/:id` | Org settings |
| POST | `/v1/orgs/:id/invites` | Invite member |
| GET/POST | `/v1/orgs/:id/vehicles` | List / create vehicles |
| POST | `/v1/orgs/:id/vehicles/import` | CSV import |
| POST | `/v1/orgs/:id/vehicles/:vid/describe` | AI/template description |
| GET/POST | `/v1/orgs/:id/listings` | Listing history / create draft |
| PATCH | `/v1/orgs/:id/listings/:lid` | Update status |
| GET | `/v1/orgs/:id/analytics/summary` | Dashboard metrics |
| GET | `/v1/orgs/:id/notifications` | Notifications |
| GET | `/v1/orgs/:id/audit` | Audit (owner/manager) |
| GET | `/v1/health` | Liveness/readiness |

---

## 7. Phased implementation plan

### Phase 0 — Foundations
Monorepo, Prisma schema, Docker Compose, env templates, CI skeleton, REQUIREMENTS.

### Phase 1 — Auth & tenancy MVP
Register/login, orgs, RBAC middleware, invites, audit basics.

### Phase 2 — Inventory
CRUD, CSV import, VIN normalize/NHTSA decode, duplicate detection, feed sync worker.

### Phase 3 — Listings & AI
Description generation, listing drafts, history, sold/price-change detection, notifications.

### Phase 4 — Extension
MV3 popup, auth, vehicle picker, Marketplace content script adapters (human-in-the-loop).

### Phase 5 — Dashboard UX
Analytics, inventory management, notifications, settings, onboarding, a11y/responsive.

### Phase 6 — Hardening
Tests (unit/integration/e2e), security headers, rate limits, logging, monitoring hooks, README.

---

## 8. Success criteria for MVP
- `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` brings up API + web.
- Demo org with sample vehicles and users.
- Extension loads unpacked and can authenticate + inject draft fields on a fixture Marketplace-like page.
- Lint, typecheck, unit/integration tests, and production builds pass in CI.
- Policy-safe Marketplace assist documented in README and extension UI.
