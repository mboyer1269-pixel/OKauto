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

The web container automatically runs `prisma migrate deploy` on startup.

## Deploy to Render

OKauto includes a [Render Blueprint](https://render.com/docs/blueprint-spec) (`render.yaml`) that provisions:

- **PostgreSQL** database
- **Redis** (Key Value) for BullMQ
- **Web service** (Docker) — Next.js dashboard + API
- **Worker service** (Docker) — background sync & notifications

### Steps

1. Push this repo to GitHub
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect the repo — Render reads `render.yaml` and creates all services
4. Set required env vars in the web service:
   - `NEXT_PUBLIC_APP_URL` — your Render web URL (e.g. `https://okauto-web.onrender.com`)
   - `AWS_S3_BUCKET`, `AWS_S3_PUBLIC_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (optional, for photo upload)
5. After first deploy, seed the database:
   ```bash
   # From Render Shell on the web service, or locally with production DATABASE_URL
   pnpm db:seed
   ```

### S3 Photo Upload

Configure these env vars on **web** (and worker if syncing photos to S3 later):

| Variable | Description |
|----------|-------------|
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_S3_PUBLIC_URL` | Public base URL (e.g. `https://my-bucket.s3.amazonaws.com` or CloudFront URL) |
| `AWS_ACCESS_KEY_ID` | IAM access key with `s3:PutObject` / `s3:DeleteObject` |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `AWS_REGION` | AWS region (default `us-east-1`) |

Without S3, photos can still be added via URL in the vehicle detail page.

### URL Inventory Sync

Add sync sources in **Dashboard → Sync Health**. Supported adapters:

| Adapter | Use case |
|---------|----------|
| `generic` | JSON array or `{ vehicles: [...] }` feed |
| `dealer-json` | Common dealer DMS feeds (`inventory`, `usedInventory`) |
| `json-ld` | Dealer website HTML with Schema.org Vehicle markup |

The worker syncs on a configurable interval and supports manual **Sync now** from the dashboard. Price changes trigger notifications.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://okauto:okauto@localhost:5432/okauto` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | — |
| `OPENAI_API_KEY` | Optional AI descriptions | — |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` |
| `AWS_S3_BUCKET` | S3 bucket for photo uploads | — |
| `AWS_S3_PUBLIC_URL` | Public URL base for S3 objects | — |
| `AWS_ACCESS_KEY_ID` | AWS credentials (optional) | — |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (optional) | — |
| `AWS_REGION` | AWS region | `us-east-1` |

## Improvements Over Reference Products

1. **Transparent policies** — Human-in-the-loop, no dark-pattern automation
2. **Resilient selectors** — Versioned DOM adapter for Facebook changes
3. **Duplicate prevention** — VIN uniqueness per organization
4. **Sync health** — Import job status, error reporting, retry
5. **Open architecture** — Self-hostable, documented API, extensible adapters
6. **Accessibility** — Mobile-responsive dashboard, keyboard-friendly

## License

Proprietary — OKauto © 2026
