# OKauto

**Production-grade dealership Facebook Marketplace listing platform** — a clean-room alternative built for inventory management, team analytics, AI-assisted descriptions, and human-in-the-loop Chrome extension listing assist.

## Features

- **Dealership Dashboard** — Inventory CRUD, CSV import, VIN decode (NHTSA), AI/template descriptions
- **Team Management** — RBAC (Owner, Admin, Manager, Salesperson), invite members, audit logs
- **Listing Tracking** — Per-salesperson analytics, listing history, stale listing detection
- **Sold Vehicle Alerts** — Notifications when inventory is marked sold
- **Chrome Extension (MV3)** — Human-in-the-loop Marketplace form assist (no auto-bypass)
- **API Keys** — Secure extension authentication
- **Background Worker** — BullMQ job processing for sync and notifications
- **Docker** — Full stack with PostgreSQL and Redis

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for database)

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Install & configure

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### 3. Run development

```bash
# Terminal 1: Web app
pnpm --filter @okauto/web dev

# Terminal 2: Background worker (optional)
pnpm --filter @okauto/worker dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@demo.okauto.local | Demo1234! |
| Manager | manager@demo.okauto.local | Demo1234! |
| Salesperson | sales@demo.okauto.local | Demo1234! |

The seed script prints an extension API key on completion.

## Chrome Extension

```bash
pnpm --filter @okauto/extension build
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `apps/extension/dist`
4. In extension Settings: enter API URL (`http://localhost:3000`) and API key
5. Select a vehicle → click **Assist** → review pre-filled Facebook Marketplace form → publish manually

> **Policy**: OKauto uses human-in-the-loop assist only. Users must review and click Publish on Facebook. We do not bypass CAPTCHA, authentication, or rate limits.

## Project Structure

```
okauto/
├── apps/
│   ├── web/          # Next.js dashboard + API
│   ├── extension/    # Chrome MV3 extension
│   └── worker/       # BullMQ background jobs
├── packages/
│   ├── database/     # Prisma schema, migrations, seed
│   └── shared/       # Types, validators, VIN decode, descriptions
├── docker-compose.yml
├── REQUIREMENTS.md   # Full product spec
└── .github/workflows/ci.yml
```

## API

REST API at `/api/v1/`. See [REQUIREMENTS.md](./REQUIREMENTS.md) for full contracts.

Key endpoints:
- `POST /api/v1/auth/login` — Authentication
- `GET /api/v1/vehicles` — Inventory
- `POST /api/v1/vehicles/import/csv` — CSV import
- `GET /api/v1/analytics/dashboard` — Team stats
- `GET /api/v1/extension` — Extension inventory (API key auth)

## Testing

```bash
pnpm test              # Unit tests
pnpm typecheck         # TypeScript
pnpm --filter @okauto/web test:e2e  # Playwright E2E
```

## Docker (Full Stack)

```bash
docker compose up --build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://okauto:okauto@localhost:5432/okauto` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | — |
| `OPENAI_API_KEY` | Optional AI descriptions | — |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` |

## Improvements Over Reference Products

1. **Transparent policies** — Human-in-the-loop, no dark-pattern automation
2. **Resilient selectors** — Versioned DOM adapter for Facebook changes
3. **Duplicate prevention** — VIN uniqueness per organization
4. **Sync health** — Import job status, error reporting, retry
5. **Open architecture** — Self-hostable, documented API, extensible adapters
6. **Accessibility** — Mobile-responsive dashboard, keyboard-friendly

## License

Proprietary — OKauto © 2026
