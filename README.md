# OKauto

Production-grade, clean-room dealership Marketplace listing platform.

OKauto helps dealerships sync vehicle inventory, generate listing descriptions, assist Facebook Marketplace posting via a Chrome Manifest V3 extension (**human-in-the-loop**), track salesperson activity, and alert teams when vehicles sell — without copying proprietary code, trademarks, or private APIs from any reference product.

Public functional reference used for capability mapping only: [shiftlyauto.com](https://shiftlyauto.com/).

See [REQUIREMENTS.md](./REQUIREMENTS.md) for verified features, assumptions, schema, API contracts, and phased plan.

## Stack

| Layer | Technology |
|---|---|
| Dashboard | Next.js 15 (App Router) + TypeScript |
| API | Fastify 5 + Zod |
| Database | PostgreSQL 16 + Prisma |
| Jobs | BullMQ + Redis (in-process fallback) |
| Extension | Chrome Manifest V3 |
| Monorepo | pnpm workspaces |

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 16
- Redis 7 (optional in development)

### Setup

```bash
cp .env.example .env
# edit secrets if needed

pnpm install
pnpm --filter @okauto/shared build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Services:

- Web dashboard: http://localhost:3000
- API: http://localhost:4000/v1/health
- Worker: feed sync scheduler (logs to console)

### Demo logins

Password for all: `DemoPass123!`

| Email | Role |
|---|---|
| owner@demo.okauto.local | owner |
| manager@demo.okauto.local | manager |
| sales@demo.okauto.local | salesperson |

### Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

## Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/extension`
4. Sign in with demo credentials (API URL `http://localhost:4000`)
5. Open Facebook Marketplace create-listing while logged into Facebook
6. Select a vehicle → **Prepare listing** → **Fill Marketplace form**
7. Review fields, attach photos, complete any CAPTCHA yourself, click **Publish**

### Policy commitments

- Never bypasses CAPTCHA, anti-bot, authentication, or rate limits
- Never auto-clicks Publish
- Assists a logged-in human filling the official create-listing UI

## Key workflows

1. **Inventory** — CSV import or JSON feed URL; VIN normalize (NHTSA VPIC); duplicate VIN detection; bulk status actions
2. **Descriptions** — template engine always available; OpenAI-compatible API when `OPENAI_API_KEY` is set
3. **Listings** — draft → ready → posted → needs_removal → removed; duplicate active listing prevention
4. **Sold alerts** — marking a vehicle sold flags related listings and notifies assignees
5. **Dashboard** — listings per salesperson, sync health, audit log, notifications

## Scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e          # API integration tests (needs DATABASE_URL)
pnpm build
node scripts/smoke.mjs # against a running API
```

## Project layout

```
apps/
  api/         Fastify REST API
  web/         Next.js dealer dashboard
  worker/      Feed sync + alert jobs
  extension/   Chrome MV3 listing assist
packages/
  db/          Prisma schema, migrations, seed
  shared/      Zod schemas, RBAC, VIN/description utils
```

## Security notes

- Passwords hashed with bcrypt (cost 12)
- JWT access + rotating refresh tokens (hashed at rest)
- Org-scoped RBAC on every mutating route
- Helmet, CORS allowlist, rate limiting
- Audit log for sensitive actions
- No secrets committed — use `.env`

## Observability

- Structured request logging with request IDs
- `/v1/health` liveness and `/v1/ready` DB readiness
- Inventory source health (`healthy` / `degraded` / `failed`)
- Listing event timeline per post

## License

Proprietary to the OKauto repository owners unless otherwise stated.
