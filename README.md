# DriveFlow

DriveFlow is a clean-room, policy-compliant dealership inventory and listing-assistance platform. It combines a multi-tenant dashboard, PostgreSQL inventory lifecycle, BullMQ workers, grounded AI descriptions, sold/price alerts, audit history, and a Chrome Manifest V3 extension.

The extension assists a signed-in user; it does not publish, remove, log in, solve CAPTCHA, or bypass platform controls. Every external action remains human-confirmed.

## Quick start

Requirements: Node.js 22+, Docker with Compose, and Chrome 116+ for the extension.

```bash
cp .env.example .env
# Replace SESSION_PEPPER and IP_HASH_KEY in .env.
docker compose up --build
```

Open http://localhost:3000 and use the seeded demo:

- Email: `owner@demo.driveflow.local`
- Password: `DemoDrive!2026`

The Docker stack starts PostgreSQL, Redis, the Next.js app, and a BullMQ worker; applies migrations; and loads idempotent demo data.

### Run services outside Docker

```bash
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

In another terminal:

```bash
npm run worker
```

## Chrome extension

Build it:

```bash
npm run extension:build
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `extension/dist`.
4. Copy the generated extension ID.
5. Set `EXTENSION_ORIGINS=chrome-extension://<extension-id>` in the app environment and restart the app.
6. Sign in to DriveFlow, create a draft, and click **Open assistant** to copy its listing ID.
7. Open the extension side panel, paste the ID, then follow its explicit download, field-preparation, review, and confirmation steps.

For a hosted deployment, set the DriveFlow URL in the side panel. Chrome requests access only to that selected origin. The extension content script runs only on Marketplace create pages and never seeks or clicks submit controls.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dashboard/API in development |
| `npm run worker` | Start background/outbox processing |
| `npm run db:migrate` | Apply ordered SQL migrations transactionally |
| `npm run db:seed` | Load idempotent demo organization/inventory |
| `npm run extension:build` | Build the Manifest V3 extension |
| `npm run lint` | Run strict ESLint |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm test` | Run unit and PostgreSQL integration tests |
| `npm run test:e2e` | Run responsive Chromium E2E tests |
| `npm run build` | Build extension and production Next.js app |
| `npm run security` | Fail on high/critical dependency advisories |

## Architecture

```text
Browser ── Next.js dashboard/API ── PostgreSQL
   │                │                    ├─ tenancy/auth/RBAC
   │                ├── Redis/BullMQ     ├─ inventory/sync history
   │                └── provider adapter ├─ listings/events
   └── MV3 extension                    └─ notifications/audit/outbox
```

- Authentication uses bcrypt password hashes and random server-hashed, revocable sessions.
- All domain queries are scoped to the authenticated organization.
- CSV/JSON adapter payloads normalize and validate VIN, stock, pricing, facts, and HTTPS media.
- Database constraints prevent duplicate active listings and duplicate organization inventory identities.
- Sold and price transitions are recorded, notified, audited, and dispatched through an idempotent outbox.
- Description generation uses a deterministic grounded engine by default. An optional OpenAI-compatible provider can be configured; failures safely fall back to the grounded engine.
- The web process is stateless. Production media should be placed in S3-compatible storage and referenced by HTTPS URL.

Detailed verified observations, assumptions, user stories, acceptance criteria, schema, and API contracts are in [REQUIREMENTS.md](./REQUIREMENTS.md).

## Inventory API example

Managers can post normalized JSON snapshots:

```json
{
  "sourceId": "00000000-0000-0000-0000-000000000000",
  "completeSnapshot": true,
  "vehicles": [
    {
      "vin": "1HGCM82633A004352",
      "stockNumber": "A-42",
      "year": 2022,
      "make": "Honda",
      "model": "Accord",
      "trim": "Sport",
      "mileage": 28450,
      "priceCents": 2699500,
      "photos": ["https://media.example.com/A-42/front.jpg"],
      "facts": {}
    }
  ]
}
```

Mutations require JSON, an authenticated same-site or configured extension origin, and support an `Idempotency-Key` header. API errors consistently return a code, safe message, details, and request ID.

## Operations and deployment

- Liveness: `GET /api/v1/health/live`
- Readiness: `GET /api/v1/health/ready`
- Logs are structured JSON in the worker and request IDs are returned by APIs.
- Database migrations are immutable ordered SQL files under `migrations/`.
- CI runs dependency audit, migrations, seed, lint, type-check, unit/integration tests, production build, and desktop/mobile E2E.
- Back up PostgreSQL continuously and test point-in-time restore. Redis is a retryable queue, not the system of record.
- Run app and worker as separate services. Keep at least one worker online and alert on failed syncs, outbox backlog, readiness failures, and removal-required age.
- Rotate session/IP hash secrets through a secret manager. Never commit `.env`.

For Render, bind the web service to `0.0.0.0:$PORT`, use managed PostgreSQL/Key Value, run `npm run db:migrate` as a pre-deploy step, and deploy the worker separately. Do not store media on the ephemeral service filesystem.

## Security and policy boundaries

- No private Meta APIs, DOM scraping of private analytics, unattended posting, anti-bot evasion, or credential handling.
- Feed URLs and media adapters must reject private/link-local destinations before server-side fetching. The MVP import endpoint accepts data directly; future URL adapters must retain that invariant.
- External provider keys are server-only.
- CSP, same-site cookies, origin checks, input validation, parameterized queries, rate limiting, RBAC, immutable audit records, and least-privilege extension permissions are enabled.
- Run `npm run security` and a first-party SAST/secret scan before release.

## License and clean-room notice

This implementation was independently designed from public product descriptions. It contains no Shiftly source code, trademarks, protected assets, credentials, or hidden APIs. Facebook and Chrome are third-party platforms with their own terms and policies; operators are responsible for compliant use.