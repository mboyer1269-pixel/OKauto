# OKauto

Production-minded, clean-room dealership Marketplace listing assistant.

OKauto helps dealership teams sync inventory, generate compliant listing copy, assist Facebook Marketplace posting with a **human in the loop**, track salesperson activity, and alert when vehicles are sold or prices change.

This is an independent implementation inspired by publicly observable capabilities of products like Shiftly Auto. It does **not** copy proprietary source, trademarks, protected assets, or hidden APIs.

## Policy stance

- Never bypass CAPTCHA, anti-bot protections, authentication, rate limits, or Meta platform restrictions.
- Extension **assists** form filling only; the salesperson reviews and submits.
- Inventory website import only fetches publicly reachable pages you configure.

See [REQUIREMENTS.md](./REQUIREMENTS.md) for verified features, schema, API contracts, and acceptance criteria.

## Monorepo layout

| Path | Purpose |
|---|---|
| `apps/api` | Fastify API + Prisma |
| `apps/web` | Next.js dealer dashboard |
| `apps/worker` | BullMQ inventory sync jobs |
| `apps/extension` | Chrome Manifest V3 assistant |
| `packages/shared` | Shared Zod schemas & helpers |

## Stack

TypeScript · Next.js 15 · Fastify · Prisma · PostgreSQL 16 · Redis 7 · BullMQ · Chrome MV3 · Vitest · GitHub Actions · Docker Compose

## Quick start (local)

### Prerequisites

- Node 20+
- pnpm 9
- Docker (for Postgres + Redis)

### 1. Environment

```bash
cp .env.example .env
```

### 2. Infrastructure

```bash
docker compose up -d postgres redis
```

### 3. Install & migrate

```bash
pnpm install
pnpm --filter @okauto/shared build
pnpm --filter @okauto/api prisma:generate
pnpm --filter @okauto/api exec prisma migrate deploy
pnpm db:seed
```

### 4. Run apps

```bash
# terminal 1
pnpm --filter @okauto/api dev

# terminal 2
pnpm --filter @okauto/worker dev

# terminal 3
pnpm --filter @okauto/web dev
```

- Dashboard: http://localhost:3000  
- API health: http://localhost:4000/v1/health  

### Demo users (after seed)

Password for all: `Password123!`

| Email | Role |
|---|---|
| owner@okauto.demo | owner |
| manager@okauto.demo | manager |
| sales1@okauto.demo | salesperson |
| sales2@okauto.demo | salesperson |

### Chrome extension

```bash
pnpm --filter @okauto/extension build
```

1. Open `chrome://extensions` → Developer mode → Load unpacked → select `apps/extension/dist`.
2. Sign into the dashboard → **Settings** → generate an extension token.
3. Paste API URL (`http://localhost:4000`) and token into extension Options.
4. Open Marketplace create/sell flow, open the side panel, **Prepare & fill**, then review and submit yourself.

## Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
```

Services: web `:3000`, api `:4000`, worker, postgres, redis.

## Scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Key workflows

1. **Inventory** — CSV/XML/website sources, duplicate VIN prevention, sync health.
2. **Prepare listing** — AI or template description + photo payload.
3. **Extension assist** — resilient selectors fill fields; user submits.
4. **Sold / price alerts** — detected on feed sync; notifications + badge.
5. **Analytics** — per-salesperson listing counts for managers.
6. **Audit** — privileged action trail.

## AI descriptions

Set `AI_ENABLED=true` and `OPENAI_API_KEY` to use an OpenAI-compatible provider. Otherwise OKauto uses deterministic templates (always available).

## Security notes

- Argon2id passwords, short-lived JWT access tokens, rotating refresh tokens, revocable extension tokens.
- Zod validation, Helmet, CORS allowlist, rate limiting.
- No secrets committed — use `.env`.

## License

Proprietary / all rights reserved unless otherwise stated by the repository owner.
