# OKauto

**OKauto** is a production-grade, **clean-room** Facebook Marketplace listing platform for
vehicle dealerships. It helps a dealership import inventory, generate policy-compliant
listing descriptions, post to Marketplace with a **human-in-the-loop** Chrome extension,
track each salesperson's activity, and get alerted when a vehicle is sold or repriced so
stale listings come down.

> Built independently. A public listing tool (Shiftly Auto) was used only as a functional
> reference — no proprietary code, trademarks, assets, or hidden APIs were used. OKauto is
> **assistive**: it never automates posting, solves CAPTCHAs, evades anti-bot controls, or
> circumvents rate limits. See [`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full spec.

## Features

- **Auth & organizations** — email/password auth (JWT cookie), dealerships, invites, and
  a six-tier RBAC model (`OWNER`, `ADMIN`, `MANAGER`, `SALESPERSON`, `VIEWER`, `SUPERADMIN`).
- **Inventory** — CRUD, CSV/JSON import with VIN decode, normalization, and duplicate
  prevention (VIN + stock + fuzzy).
- **AI descriptions** — provider-abstracted generation (OpenAI when configured, a
  deterministic template generator otherwise) with a compliance **policy linter**.
- **Human-in-the-loop listing** — an MV3 extension pre-fills the Marketplace vehicle
  composer using a resilient, versioned **selector/adapter registry**; a person reviews
  and posts.
- **Detection & notifications** — sold/price-change detection flags listings for takedown
  and notifies the lister; a Postgres-backed job queue + worker process the work.
- **Dashboard & analytics** — org KPIs, per-salesperson leaderboard, listing history,
  activity/audit log, sync health, mobile-responsive and accessibility-minded UI.
- **Ops** — structured logging, audit trail, health check, Docker, CI, migrations, seed.

## Architecture

```
apps/
  web/         Next.js 15 App Router — dashboard UI + JSON API (route handlers) + worker
  extension/   Chrome MV3 extension (esbuild) — popup, options, background, content script
packages/
  shared/      Framework-agnostic domain logic (VIN, normalize, AI, mapping, adapters,
               dedup, detection, RBAC, validation) — 41 unit tests
  db/          Prisma schema, client, migrations, seed/demo data (PostgreSQL)
```

See [`REQUIREMENTS.md`](./REQUIREMENTS.md) for data model, API contract, and rationale.

## Quick start (local)

Prerequisites: Node ≥ 20, pnpm 10, and PostgreSQL (or use Docker below).

```bash
# 1. Install
pnpm install

# 2. Configure env
cp .env.example .env               # set DATABASE_URL and AUTH_SECRET

# 3. Build shared logic + generate Prisma client
pnpm build:packages

# 4. Create the schema and seed demo data
pnpm db:migrate                    # applies packages/db/prisma/migrations
pnpm db:seed                       # demo dealership + users + inventory

# 5. Run the app
pnpm dev                           # http://localhost:3000
```

### Demo logins (after seeding)

All demo users share the password `Password123!`:

| Email | Role |
| --- | --- |
| `owner@okauto.dev` | OWNER |
| `manager@okauto.dev` | MANAGER |
| `sales1@okauto.dev` | SALESPERSON |
| `viewer@okauto.dev` | VIEWER |

## Run with Docker

```bash
docker compose up --build
# web:    http://localhost:3000   (migrations run automatically on start)
# worker: background job processor
# db:     postgres:16
```

## The Chrome extension

```bash
pnpm --filter @okauto/extension build     # -> apps/extension/dist
```

Load `apps/extension/dist` via `chrome://extensions` → **Load unpacked**, then pair it in
**Settings** using the API URL, organization ID, and a device token created on the
dashboard **Settings** page. Full instructions: [`apps/extension/README.md`](./apps/extension/README.md).

## Environment variables

See [`.env.example`](./.env.example). Key ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | JWT signing secret (32+ chars; required in production) |
| `AI_PROVIDER` / `OPENAI_API_KEY` | Optional; enables OpenAI descriptions |
| `API_ALLOWED_ORIGINS` | Extra CORS origins for the API |
| `WORKER_POLL_INTERVAL_MS` | Job queue poll interval |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the web app in dev mode |
| `pnpm build` | Build packages, web, and extension |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality gates across the monorepo |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate` | Database lifecycle |
| `pnpm --filter @okauto/web worker` | Run the background job worker |
| `pnpm --filter @okauto/web test:e2e` | Playwright E2E (needs a running app + DB) |

## Testing

- **Unit** (`@okauto/shared`): VIN, normalization, AI templates, policy, mapping, adapters,
  dedup, detection, RBAC, CSV — 41 tests.
- **Integration** (`@okauto/web`): import + listing services with a mocked Prisma client.
- **E2E** (Playwright): landing → register → dashboard smoke flow.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, test, build on every push/PR, plus
  a Postgres job that applies migrations and seeds.

## Security & policy

- Passwords hashed with scrypt; JWT sessions in httpOnly cookies; revocable per-device API
  tokens (hashed at rest) for the extension.
- Every mutating endpoint enforces RBAC + org scoping and writes an audit log.
- Zod validation at the edge; CORS restricted to the dashboard and extension origins.
- Description policy linter blocks discriminatory/prohibited content before save.
- The extension is strictly assistive and respects all Meta/Chrome platform policies.

## License

Provided as-is for evaluation. Add a license file appropriate to your use.
