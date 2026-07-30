# OKauto

Production-minded, clean-room dealership platform for **assistive** Facebook Marketplace vehicle listings.

OKauto helps dealerships sync inventory, generate compliant descriptions, track salesperson listing activity, and alert teams when units sell — while keeping a human in the loop for Marketplace publishing. It does **not** bypass CAPTCHA, authentication, rate limits, or Meta anti-bot controls.

Public marketing materials for Shiftly Auto were used only as a functional reference. No proprietary code, trademarks, or hidden APIs were copied.

## Stack

| Layer | Choice |
|---|---|
| Dashboard + API | Next.js 15 (App Router) + TypeScript |
| Extension | Chrome Manifest V3 |
| Database | PostgreSQL + Prisma |
| Jobs | BullMQ + Redis |
| Auth | Session cookies (web) + hashed extension bearer tokens |
| AI descriptions | Optional OpenAI-compatible API; template engine fallback |
| Monorepo | pnpm workspaces + Turborepo |

## Monorepo layout

```
apps/web         Dealer dashboard + REST API (/api/v1/*)
apps/extension   Chrome MV3 assistive lister
apps/worker      Inventory sync + sold detection jobs
packages/db      Prisma schema, migrations, seed
packages/shared  Zod schemas, RBAC helpers
```

See [REQUIREMENTS.md](./REQUIREMENTS.md) for verified features, schema, API contracts, and acceptance criteria.

## Quick start (local)

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 16
- Redis 7

Or use Docker Compose for Postgres/Redis (and optionally the full stack).

### 1. Install

```bash
pnpm install
cp .env.example .env
# Also used by apps:
cp .env.example apps/web/.env.local
# Edit DATABASE_URL / SESSION_SECRET as needed
```

Default local DB URL:

```
postgresql://okauto:okauto@localhost:5432/okauto
```

### 2. Database

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Demo users (password `DemoPass123!`):

- `owner@demo.okauto.local`
- `manager@demo.okauto.local`
- `alex@demo.okauto.local`
- `sam@demo.okauto.local`

### 3. Run

```bash
# terminal 1
pnpm --filter @okauto/web dev

# terminal 2
pnpm --filter @okauto/worker dev
```

Open http://localhost:3000

### 4. Chrome extension

```bash
pnpm --filter @okauto/extension build
```

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `apps/extension`
2. Dashboard → Extension → Generate token
3. Paste token into the popup and Connect
4. Open Facebook Marketplace vehicle create → Assist fill
5. Complete any Facebook challenges yourself and click Publish

## Docker

```bash
docker compose up --build
```

Runs Postgres, Redis, web, and worker. Apply migrations/seed against the compose database on first boot:

```bash
docker compose exec web pnpm --filter @okauto/db migrate:deploy
docker compose exec web pnpm --filter @okauto/db seed
```

## API overview

Authenticated via session cookie or `Authorization: Bearer <extension-token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness + DB/Redis |
| POST | `/api/v1/auth/register` | Create user + org |
| POST | `/api/v1/auth/login` | Sign in |
| GET | `/api/v1/vehicles` | Inventory |
| POST | `/api/v1/vehicles/import` | CSV import |
| POST | `/api/v1/vehicles/:id/describe` | AI/template description |
| POST | `/api/v1/listings` | Start assist listing |
| PATCH | `/api/v1/listings/:id` | Status updates |
| GET | `/api/v1/analytics/overview` | Dealer KPIs |
| GET | `/api/v1/extension/vehicles` | Extension inventory feed |

## Compliance posture

- Assistive form fill only (human confirms & publishes)
- CAPTCHA / checkpoint detection pauses automation
- No unattended headless Facebook posting
- Passwords hashed with Argon2id; extension tokens hashed at rest
- RBAC: OWNER / ADMIN / MANAGER / SALESPERSON
- Audit log for sensitive org actions

## Tests & quality

```bash
pnpm --filter @okauto/shared test
pnpm --filter @okauto/web test
pnpm --filter @okauto/extension test
pnpm --filter @okauto/web typecheck
pnpm --filter @okauto/web build
```

E2E (Playwright) — start web first or let Playwright boot it:

```bash
pnpm --filter @okauto/web exec playwright install chromium
pnpm --filter @okauto/web test:e2e
```

CI runs lint/typecheck/unit/build on push via `.github/workflows/ci.yml`.

## Sample data

Import `samples/demo-inventory.csv` from **Dashboard → Inventory**.

## Environment

See `.env.example` for `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, optional `AI_API_KEY`, and SMTP settings.

## License

Proprietary / all rights reserved unless otherwise stated by the repository owner.
