# OKauto — Requirements & Architecture

> A production-grade, **clean-room** alternative to Facebook Marketplace listing tools for
> vehicle dealerships (Shiftly Auto used only as a public functional reference). No
> proprietary code, trademarks, protected assets, or hidden/undocumented APIs are used.
> Capabilities are reproduced independently and improved.

## 1. Product summary

OKauto helps a dealership (organization) list and manage its vehicle inventory on
Facebook Marketplace using a **human-in-the-loop** Chrome extension. It ingests
inventory (VIN/photos/pricing), normalizes it, generates policy-compliant listing
descriptions with AI assistance, pre-fills the Marketplace composer for a human to
review and post, tracks each salesperson's activity, and raises alerts when a vehicle
is sold or its price changes so stale listings can be taken down.

### 1.1 Reconnaissance findings (from public reference product)

| Capability | Observed behavior | OKauto approach |
| --- | --- | --- |
| Inventory ingestion | Pulls VIN data, photos, pricing from DMS/website | CSV/JSON import + website/feed adapter interface + manual entry |
| Description generation | "Compliant descriptions ready-to-post" | Provider-abstracted AI (OpenAI) with deterministic template fallback; policy linting |
| Marketplace posting | Post/manage inventory "in minutes" | MV3 extension pre-fills composer; **human reviews & submits** (no automated posting/CAPTCHA bypass) |
| Dealer dashboard | Real-time tracking of each salesperson's listings | Dashboard with per-salesperson analytics and listing history |
| Sold alerts | Notify staff when a vehicle is sold → remove listing | Sold/price-change detection + notifications + takedown workflow |
| Salesperson analytics | Track listings/leads per rep | Per-user KPIs, leaderboards, activity feed |
| Multi-niche | Auto, RV, marine, real estate, farm, furniture | `category` on inventory items; auto is first-class |
| Onboarding | "Get started in 60 seconds" | Org creation → invite team → import inventory wizard |

### 1.2 Assumptions (documented decisions)

- **A1.** Listing to Marketplace is **assistive**: the extension fills the native composer
  and a human clicks post. We never automate submission, defeat CAPTCHA, anti-bot, auth,
  or rate limits (Meta/Chrome policy compliance).
- **A2.** "Sold detection" is driven by (a) inventory feed diffs (item removed / marked
  sold) and (b) a manual "mark sold" action; optional extension-side observation of a
  listing the user already owns. We do **not** scrape third-party accounts.
- **A3.** VIN decoding uses the public NHTSA vPIC API when available, with an offline
  structural decoder (WMI/region/check-digit/model-year) as fallback so the system works
  without network access.
- **A4.** Auth is self-contained (email/password + JWT session cookie) to avoid a hard
  dependency on an external IdP; OAuth can be layered later.
- **A5.** The job queue is Postgres-backed for zero-infra local dev; the interface allows
  swapping in BullMQ/Redis for scale.

## 2. User roles (RBAC)

- **OWNER** — full control of an org, billing, danger-zone actions.
- **ADMIN** — manage members, inventory, settings, view all analytics.
- **MANAGER** — manage inventory & listings, view all salesperson analytics.
- **SALESPERSON** — manage their own listings, view their own analytics.
- **VIEWER** — read-only.
- **SUPERADMIN** — platform operator (cross-org administration, feature flags).

Permissions are centralized in `@okauto/shared/rbac` as `(role, action) -> boolean`.

## 3. User stories & acceptance criteria (selected)

1. **Onboard org** — As an owner I can register, create a dealership, and invite members.
   - AC: registration creates an org + OWNER membership; invite issues a tokenized link;
     accepting creates a scoped membership; audit log records each step.
2. **Import inventory** — As a manager I can import a CSV/JSON of vehicles.
   - AC: rows are validated (Zod), normalized (make/model/trim/mileage/price), VIN decoded,
     duplicates detected by VIN/stock number, and a per-row result report is returned.
3. **Generate description** — As a salesperson I can generate a compliant description.
   - AC: output includes key specs, is policy-linted (no banned/discriminatory phrasing,
     no contact-info spam), and is editable before saving; generation is logged.
4. **Assisted listing** — As a salesperson I open a vehicle in the extension on Marketplace
   and the composer is pre-filled (title, price, category, description, photos queue).
   - AC: I review and submit manually; the listing is recorded as `PENDING → ACTIVE`.
5. **Sold/price-change alert** — When a vehicle is marked sold or repriced, active listings
   are flagged for takedown and the lister is notified.
   - AC: notification created; listing status → `NEEDS_ATTENTION`; dashboard surfaces it.
6. **Dashboard & analytics** — As an admin I see org KPIs and per-salesperson performance.
   - AC: counts of active/sold/needs-attention listings, listings-per-rep, time-to-list,
     activity feed; mobile-responsive; accessible (labelled controls, keyboard nav).

## 4. Architecture

```
┌──────────────────────┐        HTTPS/JSON        ┌───────────────────────────┐
│  Chrome MV3 Extension │  ───────────────────────▶│  Next.js app (apps/web)   │
│  (React + Vite)       │  API token (per device)  │  - App Router UI          │
│  - popup / options    │◀─────────────────────────│  - Route Handlers = API   │
│  - background SW      │                          │  - Auth (JWT cookie)      │
│  - content script     │   pre-fills composer     │  - DB-backed job worker   │
│    (Marketplace)      │   (human submits)        └────────────┬──────────────┘
└──────────────────────┘                                       │ Prisma
        ▲                                                       ▼
        │ shared logic (@okauto/shared)                ┌────────────────┐
        └──────────────────────────────────────────────│  PostgreSQL     │
          types, zod, VIN, normalize, AI, mapping,      └────────────────┘
          adapters, dedup, detection, rbac
```

- **packages/shared** — framework-agnostic domain logic (fully unit-tested).
- **packages/db** — Prisma schema, client, migrations, seed/demo data.
- **apps/web** — dashboard UI + REST-ish API (route handlers) + background worker.
- **apps/extension** — MV3 extension (popup, options, background, Marketplace content script).

## 5. Data model (see `packages/db/prisma/schema.prisma`)

Core entities: `User`, `Organization`, `Membership` (role), `Invite`, `ApiToken`,
`Vehicle` (inventory item), `VehiclePhoto`, `Listing`, `ListingEvent`,
`ImportBatch`, `Notification`, `AuditLog`, `Job`, `Session` (implicit via JWT).

Key relationships: an `Organization` has many `Membership`, `Vehicle`, `Listing`,
`Notification`, `AuditLog`. A `Vehicle` has many `VehiclePhoto` and `Listing`. A
`Listing` belongs to a `Vehicle`, a lister (`User`), and an `Organization`, and has many
`ListingEvent` (status transitions, price changes, sold detection).

## 6. API contract (summary; `/api/v1`)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /orgs`, `GET /orgs/:id`, `PATCH /orgs/:id`
- `POST /orgs/:id/invites`, `POST /invites/accept`
- `GET /orgs/:id/members`, `PATCH /members/:id`, `DELETE /members/:id`
- `GET/POST /orgs/:id/vehicles`, `GET/PATCH/DELETE /vehicles/:id`
- `POST /orgs/:id/vehicles/import` (CSV/JSON) → per-row report
- `POST /vehicles/:id/description` (AI generate) 
- `GET/POST /orgs/:id/listings`, `PATCH /listings/:id`, `POST /listings/:id/events`
- `POST /vehicles/:id/mark-sold`, `POST /vehicles/:id/reprice`
- `GET /orgs/:id/analytics`, `GET /orgs/:id/activity`
- `GET/POST /me/tokens` (extension device tokens), `DELETE /tokens/:id`
- `GET /notifications`, `POST /notifications/:id/read`
- Extension endpoints: `GET /extension/vehicles?ready=1`, `POST /extension/listings`,
  `POST /extension/listings/:id/status`

All responses are JSON `{ data }` or `{ error: { code, message, details? } }`.
Auth via `Cookie` (dashboard) or `Authorization: Bearer <apiToken>` (extension).

## 7. Security

- Passwords hashed with scrypt (Node `crypto`), constant-time compare.
- JWT (HS256, `jose`) signed with `AUTH_SECRET`; httpOnly, sameSite cookies.
- Per-device API tokens (hashed at rest) for the extension; revocable.
- Every mutating handler enforces RBAC + org scoping; audit-logged.
- Input validated with Zod at the edge; output never leaks password/token hashes.
- CORS restricted to allowed origins; extension uses explicit host permissions.
- Description policy linter blocks discriminatory/prohibited content before save.

## 8. Improvements over the reference

Resilient Marketplace **adapter/selector registry** (versioned, self-healing with
fallbacks), duplicate prevention (VIN + stock + fuzzy), **sync health** panel, bulk
actions, structured logging + request IDs, accessibility (WCAG-minded), mobile-responsive
dashboard, explicit failure recovery (retryable jobs, dead-letter), and full observability
of import/listing pipelines.

## 9. Phased implementation plan

1. **P0 Foundation** — monorepo, shared domain logic + tests, DB schema, seed. ✅
2. **P1 Auth & Orgs** — register/login, RBAC, memberships, invites, API tokens. ✅
3. **P2 Inventory** — CRUD, import, normalize, VIN decode, dedup. ✅
4. **P3 Listings & AI** — description generation, listing lifecycle, events. ✅
5. **P4 Detection & Notifications** — sold/price-change, notifications, worker. ✅
6. **P5 Dashboard** — analytics, activity, listing history, sync health. ✅
7. **P6 Extension** — popup/options, token pairing, Marketplace assist content script. ✅
8. **P7 Hardening** — tests, CI, Docker, docs, observability. ✅

## 10. Testing strategy

- **Unit** (Vitest): all `@okauto/shared` logic — VIN, normalize, AI templates, mapping,
  adapters, dedup, detection, rbac, validation.
- **Integration** (Vitest): API route handlers with a mocked Prisma client.
- **E2E** (Playwright, config provided): dashboard smoke flow; runs in CI with a Postgres
  service (documented; not required for unit/lint/typecheck gates).
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` on every milestone/CI.
