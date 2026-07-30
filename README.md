# OKauto — Dealership Listing-Assistance Platform

OKauto helps dealership teams get inventory in front of Marketplace buyers fast:
**import → normalize → describe → assisted listing → sold detection → team analytics.**

It is an independent, **clean-room** implementation inspired only by the *publicly
observable behavior* of products in this category (public marketing pages and public
extension store copy). No proprietary code, assets, trademarks, or private APIs were
used. See [REQUIREMENTS.md](./REQUIREMENTS.md) for the recon notes, architecture,
schema, API contracts, and phased plan.

## What's in the box

| Surface | Path | Tech |
|---|---|---|
| Dealer dashboard | `apps/web` | Next.js 15 (App Router), React 19, Tailwind |
| API + worker | `apps/api` | Fastify 5, Prisma, PostgreSQL 16, PG-backed job queue |
| Chrome extension | `apps/extension` | Manifest V3, esbuild, zero runtime deps |
| Shared domain lib | `packages/shared` | zod contracts, RBAC, state machine, VIN decoder, description engine |
| Database | `packages/database` | Prisma schema, migrations, demo seed |
| E2E | `e2e` | Playwright (12 browser tests) |

## Quickstart (local)

Prerequisites: Node ≥ 20, pnpm 10, PostgreSQL 16 (or `docker compose up postgres`).

```bash
# 1. Create databases (adjust credentials as needed)
sudo -u postgres psql -c "CREATE USER okauto WITH PASSWORD 'okauto_dev_password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE okauto OWNER okauto;"
sudo -u postgres psql -c "CREATE DATABASE okauto_test OWNER okauto;"

# 2. Install, configure, migrate, seed
cp .env.example .env
export DATABASE_URL="postgresql://okauto:okauto_dev_password@localhost:5432/okauto"
pnpm install
pnpm -r build            # builds shared + db + api + extension + web
pnpm db:migrate          # prisma migrate deploy
pnpm db:seed             # demo dealership + inventory + listings

# 3. Run (two terminals)
pnpm --filter @okauto/api dev    # http://localhost:4000
pnpm --filter @okauto/web dev    # http://localhost:3000
```

**Demo logins** (password `demo-password-123`):

| Account | Role |
|---|---|
| `owner@demo.dev` | Org owner — full access |
| `manager@demo.dev` | Manager — team/analytics |
| `sam@demo.dev` / `riley@demo.dev` | Salesperson — own listings/queue |
| `admin@okauto.dev` | Platform admin — cross-org admin page |

## Quickstart (Docker)

```bash
docker compose up -d postgres api web           # full stack
docker compose --profile setup run --rm migrate # apply migrations once
# seed demo data from the host:
DATABASE_URL="postgresql://okauto:okauto_dev_password@localhost:5432/okauto" pnpm db:seed
```

Dashboard: http://localhost:3000 · API: http://localhost:4000 (`/healthz`, `/readyz`, `/metrics`)

## Chrome extension (assisted listing)

1. `pnpm --filter @okauto/extension build` → `apps/extension/dist/`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`
3. Dashboard → **Settings → Extension** → create a pairing token (shown once)
4. Extension Options → paste API URL (`http://localhost:4000`) + token → **Test connection**
5. Popup shows **your listing queue**; click **Assist listing**

**Policy compliance by design (hard requirements G1–G3):**
- The extension fills the Marketplace form and stages photos — **you** review and click
  Publish. It never auto-submits, never bypasses CAPTCHAs/anti-bot protections, and
  never touches your credentials. Publish is auto-detected (URL change) and reported
  back, flipping the listing `LIVE` in the dashboard.
- Aborted/failed flows land listings in `ATTENTION` with a remediation hint + re-queue.
- Selectors are *resilient ordered strategies* (ARIA role+name → label → placeholder →
  CSS) with match telemetry; they're **config-over-code** so a Marketplace layout change
  is a config update, not a deploy (see `apps/extension/src/lib/adapter-config.ts`).

## Core workflows

- **Inventory import**: CSV upload (aliased headers, e.g. `vin,stocknumber,year,make,model,price,miles,photos`),
  JSON feed (pull, scheduled), or HMAC-signed webhook (push). Rows are normalized,
  VIN-decoded (ISO 3779 check digit + year + WMI), deduped by VIN/stock #, and
  idempotent — re-importing yields `0 created, N unchanged`. Row-level errors never
  block the batch; every run is recorded with stats.
- **Sold detection**: each full-snapshot sync updates `lastSeenAt`. Vehicles missing
  from the latest run become `SUSPECTED_SOLD`, their LIVE listings move to
  `NEEDS_REMOVAL`, and stakeholders get a realtime alert. Removing the listing
  confirms the sale (`SOLD` + audit trail).
- **Descriptions**: one-click generation (template provider by default; optional
  OpenAI-compatible provider via `OPENAI_API_KEY`) with a compliance scrubber
  (misleading-phrase filter + dealer disclosure footer) applied to *every* path.
- **Listings**: explicit state machine
  (`DRAFT→READY→QUEUED→…→LIVE→NEEDS_REMOVAL→REMOVED`, `ATTENTION` for recoverable
  failures), append-only events, duplicate prevention via a partial unique index.
- **Team analytics**: per-salesperson listings/day (7/14/30d), queue depth, funnel,
  sync health, CSV export. Managers track posting activity like the reference product
  advertises — plus audit data to back every number.

## Security model

- bcrypt passwords; 15-min JWT access tokens; rotating refresh tokens in httpOnly
  cookies **with reuse detection** (a replayed refresh token revokes the session family).
- Extension PATs stored as SHA-256 hashes (plaintext shown once), revocable per user/org.
- Every route enforces org-scoped RBAC (`packages/shared/src/rbac.ts`); cross-tenant
  access is uniformly 403/404 (no tenant enumeration). Integration-tested.
- zod validation on every input; HMAC (timing-safe) for push webhooks; rate limits on
  auth; security headers on API + web; secrets via env only; audit log for sensitive actions.

## Testing

```bash
pnpm lint                 # eslint flat config
pnpm -r typecheck         # strict TS everywhere
pnpm -r test              # 111 tests: shared(38) api(48) extension(16) web(9)
pnpm --filter @okauto/e2e test   # 12 Playwright browser tests (boots API + web)
```

API integration tests run against real Postgres (`okauto_test`) — no mocks for the
data plane. CI (`.github/workflows/ci.yml`) runs everything including E2E.

## Configuration

See [.env.example](./.env.example). Highlights: `VIN_PROVIDER=local|vpic` (offline
default; optional public NHTSA API), `DESCRIPTION_PROVIDER=template|openai`,
`EMAIL_TRANSPORT=log|smtp`, job queue tuning, CORS allowlist.

## Repository layout

```
apps/api        Fastify modules (auth, orgs, members, vehicles, imports, listings,
                descriptions, notifications, analytics, extension, admin) + job queue
apps/web        Next.js dashboard (15 routes, responsive, accessible)
apps/extension  MV3 assistant (popup, options, service worker, content adapter)
packages/shared zod contracts, RBAC, listing state machine, VIN + description engines
packages/database Prisma schema/migrations/seed
e2e             Playwright specs + dual-webServer config
```

## Roadmap (post-MVP, see REQUIREMENTS.md §8)

P1: SMTP transport, Groups-channel assist, feed scheduling UI, analytics export polish.
P2: multi-feed sources, dealer website ingestion adapters, audit export, SSO-ready auth.
