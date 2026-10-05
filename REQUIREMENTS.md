# OKauto — Product Requirements Document

> Clean-room alternative to dealership Facebook Marketplace listing tools.  
> Reference product analyzed: [Shiftly Auto](https://shiftlyauto.com/) (public marketing pages, Chrome Web Store metadata, third-party reviews). No proprietary code or assets were copied.

## 1. Product Reconnaissance Summary

### 1.1 Reference Product Capabilities (Verified Publicly)

| Capability | Shiftly Auto (reference) | OKauto (our implementation) |
|------------|--------------------------|------------------------------|
| Chrome extension for FB Marketplace | MV3 extension, 10k+ users | MV3 extension with human-in-the-loop assist |
| Inventory import | DMS feeds, dealer websites, CSV | CSV, URL scrape adapter, manual entry, API |
| VIN / vehicle data | Pulls from inventory sources | NHTSA VIN decode + normalized schema |
| AI descriptions | SEO-optimized, compliant copy | Template + optional OpenAI generation |
| Dealer dashboard | Manager portal, staff activity | Full dashboard with RBAC |
| Salesperson analytics | Listings per rep | Per-rep metrics, leaderboard, history |
| Sold vehicle alerts | AI alerts to remove stale listings | Inventory sync + notification system |
| Bulk listing | ~60 seconds per unit | Queue-based bulk assist workflow |
| Multi-vertical | Auto, RV, marine, etc. | Automotive MVP, extensible categories |
| Training/community | External Skool community | In-app onboarding + help center |

### 1.2 User Roles

| Role | Permissions |
|------|-------------|
| **Owner** | Full org control, billing, delete org |
| **Admin** | User management, settings, all inventory |
| **Manager** | Team analytics, assign vehicles, approve listings |
| **Salesperson** | List assigned/available inventory, view own stats |

### 1.3 Core Workflows

1. **Onboarding**: Register → Create/join dealership → Install extension → Connect API key
2. **Inventory ingest**: Import CSV / sync URL / manual add → Normalize → Photos attached
3. **Listing assist**: Select vehicle in extension → Review pre-filled data → User posts on FB manually with assist
4. **Activity tracking**: Extension reports listing events → Dashboard updates metrics
5. **Sold detection**: Mark sold in inventory OR import sync → Alert assigned salesperson → Remind to delist
6. **Manager oversight**: Dashboard shows per-rep listing counts, stale listings, sync health

### 1.4 Policy Constraints (Non-Negotiable)

- **Never** bypass CAPTCHA, anti-bot, authentication, or rate limits
- **Human-in-the-loop**: Extension pre-fills and guides; user confirms each Marketplace post
- **No hidden Meta APIs**: Use DOM assist on Marketplace create flow only
- **Respect Chrome Web Store policies**: Minimal permissions, clear privacy policy

---

## 2. Assumptions

1. MVP targets **automotive dealerships** (single org per account, multi-user).
2. Facebook Marketplace listing is **assistive** — user must click Publish on Facebook.
3. VIN decode uses free **NHTSA vPIC API** (no API key required).
4. AI descriptions use templates by default; OpenAI when `OPENAI_API_KEY` is set.
5. Inventory URL import supports generic JSON-LD / common dealer site patterns (adapter pattern).
6. Authentication: email/password + JWT access/refresh tokens; extension uses API keys.
7. Single-region deployment; PostgreSQL + Redis for queue.

---

## 3. User Stories & Acceptance Criteria

### US-1: Authentication
**As a** dealership user, **I want** to register and log in securely **so that** my inventory is protected.

- [ ] Register with email, password, name
- [ ] Login returns JWT access (15m) + refresh (7d) tokens
- [ ] Password hashed with bcrypt (cost 12)
- [ ] Session refresh without re-login

### US-2: Organization & RBAC
**As an** owner, **I want** to invite team members with roles **so that** access is controlled.

- [ ] Create organization (name, website, phone)
- [ ] Invite users by email with role assignment
- [ ] Role-based API authorization on all endpoints
- [ ] Audit log for permission-sensitive actions

### US-3: Inventory Management
**As a** manager, **I want** to import and manage vehicle inventory **so that** salespeople can list them.

- [ ] CRUD vehicles with VIN, year, make, model, trim, price, mileage, color, description, status
- [ ] Upload/manage photos (URLs for MVP; S3-ready interface)
- [ ] CSV import with column mapping
- [ ] VIN decode enriches missing fields
- [ ] Status: `available`, `pending`, `sold`, `archived`
- [ ] Duplicate VIN prevention per organization

### US-4: AI Listing Descriptions
**As a** salesperson, **I want** compliant listing descriptions generated **so that** I post faster.

- [ ] One-click generate from vehicle data
- [ ] Template fallback without OpenAI
- [ ] Description includes year/make/model, mileage, price, features
- [ ] Regenerate and edit before listing

### US-5: Chrome Extension Listing Assist
**As a** salesperson, **I want** the extension to pre-fill Marketplace forms **so that** listing takes ~60 seconds.

- [ ] Extension authenticates with API key
- [ ] Browse org inventory from popup
- [ ] Select vehicle → open Marketplace create page
- [ ] Content script fills fields (title, price, description, location hint)
- [ ] User reviews and submits on Facebook
- [ ] Extension reports `listing_created` event to API

### US-6: Manager Dashboard
**As a** manager, **I want** real-time team analytics **so that** I ensure consistent listing activity.

- [ ] Overview: total inventory, listed, sold, stale
- [ ] Per-salesperson: listings this week/month, last activity
- [ ] Listing history with timestamps
- [ ] Filter by date range and status

### US-7: Sold Vehicle Alerts
**As a** salesperson, **I want** alerts when my listed vehicle sells **so that** I remove stale Marketplace posts.

- [ ] Marking vehicle sold triggers notification to assigned listers
- [ ] Dashboard shows sold-but-still-listed warnings
- [ ] Notification read/unread state

### US-8: Sync Health & Bulk Actions
**As an** admin, **I want** import job status and bulk operations **so that** inventory stays current.

- [ ] Import jobs with progress, errors, retry
- [ ] Bulk status update (archive, assign)
- [ ] Sync source configuration (URL, interval)

---

## 4. Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Chrome Extension│────▶│  Next.js App     │────▶│  PostgreSQL     │
│ (MV3)           │     │  (Dashboard+API) │     │  (Prisma)       │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                        ┌────────▼─────────┐     ┌─────────────────┐
                        │  Worker (BullMQ) │────▶│  Redis          │
                        └──────────────────┘     └─────────────────┘
```

### Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Web/API | Next.js 15 (App Router), API Routes |
| Database | PostgreSQL 16, Prisma ORM |
| Queue | BullMQ + Redis |
| Auth | JWT + API keys (extension) |
| Extension | Chrome Manifest V3, TypeScript, Vite |
| AI | OpenAI (optional) + template engine |
| Testing | Vitest (unit), Playwright (E2E) |
| CI/CD | GitHub Actions |
| Containers | Docker Compose |

---

## 5. Database Schema

See `packages/database/prisma/schema.prisma` for authoritative schema.

**Core entities**: `User`, `Organization`, `OrganizationMember`, `Vehicle`, `VehiclePhoto`, `Listing`, `ListingEvent`, `Notification`, `ImportJob`, `SyncSource`, `ApiKey`, `AuditLog`, `RefreshToken`

---

## 6. API Contracts (REST)

Base URL: `/api/v1`

### Auth
- `POST /auth/register` — `{ email, password, name, organizationName? }`
- `POST /auth/login` — `{ email, password }`
- `POST /auth/refresh` — `{ refreshToken }`
- `POST /auth/logout` — invalidate refresh token

### Organizations
- `GET /organizations/current`
- `PATCH /organizations/current`
- `GET /organizations/members`
- `POST /organizations/members/invite`
- `PATCH /organizations/members/:id`
- `DELETE /organizations/members/:id`

### Vehicles
- `GET /vehicles` — query: status, assignedTo, search, page, limit
- `POST /vehicles`
- `GET /vehicles/:id`
- `PATCH /vehicles/:id`
- `DELETE /vehicles/:id`
- `POST /vehicles/import/csv`
- `POST /vehicles/:id/decode-vin`
- `POST /vehicles/:id/generate-description`

### Listings
- `GET /listings`
- `POST /listings` — record listing event from extension
- `PATCH /listings/:id`
- `GET /listings/analytics`

### Notifications
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

### Extension
- `POST /extension/authenticate` — `{ apiKey }`
- `GET /extension/inventory` — API key auth
- `POST /extension/events` — listing events

### Admin
- `GET /admin/audit-logs`
- `GET /admin/import-jobs`
- `POST /admin/api-keys`
- `DELETE /admin/api-keys/:id`

---

## 7. Phased Implementation Plan

### Phase 1 — Foundation (MVP) ✅ Target
- Monorepo scaffold, Docker, CI
- Database schema, migrations, seed
- Auth + RBAC
- Vehicle CRUD + CSV import + VIN decode
- Basic dashboard pages
- Chrome extension popup + FB assist content script
- Listing event tracking
- Sold notifications
- Unit + integration tests

### Phase 2 — Enhancements
- S3 photo upload
- URL inventory sync adapters (Dealer.com, etc.)
- Email notifications (Resend)
- Advanced analytics charts
- Price change detection

### Phase 3 — Scale
- Multi-org (dealer groups)
- Webhook integrations
- Mobile-responsive PWA
- Rate limiting per org tier

---

## 8. Improvements Over Reference

1. **Faster workflows**: Keyboard shortcuts, bulk select, queue panel in extension
2. **Resilient selectors**: Adapter pattern for FB DOM with versioned selector configs
3. **Duplicate prevention**: VIN + stock number uniqueness, import dedup
4. **Sync health dashboard**: Last sync, error count, retry button
5. **Observability**: Structured logging, health endpoints, job metrics
6. **Accessibility**: WCAG 2.1 AA dashboard targets
7. **Clear failure recovery**: Per-vehicle import errors, partial success reporting
8. **Transparent policies**: In-app compliance notice, no dark-pattern automation

---

## 9. Comptes démo (local / CI seulement)

Jamais en production. `NODE_ENV=production` bloque le seed sauf `ALLOW_DEMO_SEED=true` sur une base jetable.

| Rôle | Courriel |
|------|----------|
| Owner | owner@demo.okauto.local |
| Manager | manager@demo.okauto.local |
| Salesperson | sales@demo.okauto.local |

Organisation locale : **Buckingham Chevrolet Buick GMC** (véhicules d’exemple). Le mot de passe n’est imprimé que par `pnpm db:seed`.
