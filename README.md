# OKauto ListingOps

OKauto ListingOps is a clean-room, production-shaped dealership inventory and marketplace listing assistant. It includes a Next.js dashboard/API, PostgreSQL/Prisma data model, shared TypeScript validation contracts, and a Chrome Manifest V3 extension for human-in-the-loop vehicle capture and listing preparation.

The public Shiftly Auto website and public Chrome extension metadata were used only as functional references. This repository does not copy proprietary code, trademarks, brand assets, private APIs, or hidden platform behavior.

## What is included

- Dealer dashboard with metrics, inventory lifecycle, listing status, alerts, sync health, and activity.
- Signed-cookie authentication with hashed seeded credentials.
- Organization/dealership/user/RBAC-aware database schema.
- Inventory import API with duplicate, price-change, and sold-state detection.
- Extension capture API with hashed bearer tokens.
- Marketplace listing draft generation and history snapshots.
- Chrome MV3 extension with visible-page extraction, popup settings, side-panel guardrails, and user-triggered field assistance.
- Prisma migrations/seed data, Docker Compose, CI, lint/type/test/build scripts.

## Stack

- TypeScript monorepo with pnpm workspaces and Turbo.
- `apps/web`: Next.js App Router, React, route-handler REST API.
- `packages/shared`: Zod schemas, normalization, duplicate detection, listing copy generation, demo data.
- `packages/db`: Prisma, PostgreSQL schema, seed data, credential helpers.
- `packages/extension`: Chrome Manifest V3 extension built with Vite and React.

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:web
```

Open `http://localhost:3000` and sign in with:

- Email: `owner@okauto.test`
- Password: `okauto-demo-pass`

## Extension development

```bash
pnpm dev:extension
```

Then load `packages/extension/dist` as an unpacked extension in Chrome.

Default local extension settings:

- API base URL: `http://localhost:3000`
- Token: value of `OKAUTO_EXTENSION_TOKEN` from `.env` (defaults to `demo-extension-token-rotate-before-production` for seeded local data)

The extension:

- Captures only visible page data and JSON-LD available to the active browser tab.
- Requires a user click to capture or prepare visible form fields.
- Never submits marketplace listings automatically.
- Does not bypass CAPTCHA, login, anti-bot protections, rate limits, or platform restrictions.

## Useful scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm ci
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## API overview

- `GET /api/v1/dashboard` - protected dashboard JSON.
- `POST /api/v1/capture` - extension capture ingestion with `Authorization: Bearer <token>`.
- `GET /api/v1/listings/generate` - protected sample listing copy generation.
- `POST /api/v1/listings/generate` - protected listing draft creation for a vehicle.
- `PATCH /api/v1/listings/:id` - protected listing status/assignment/URL updates.
- `POST /api/v1/inventory/import` - owner/manager inventory import.

All errors use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Human readable message"
  }
}
```

## Production hardening checklist

- Replace demo credentials and rotate `NEXTAUTH_SECRET` and `OKAUTO_EXTENSION_TOKEN`.
- Put Postgres and Redis on managed, backed-up services.
- Add a transactional email provider for invite/password reset workflows.
- Configure an OAuth/OIDC provider if passwordless or SSO is required.
- Add OpenTelemetry exporter details in `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Review Chrome Web Store host permissions and narrow them to approved dealer domains where possible.
- Add real dealership compliance footer/disclosure configuration.

See `REQUIREMENTS.md` for full product reconnaissance, architecture, database schema, API contracts, acceptance criteria, and phased roadmap.