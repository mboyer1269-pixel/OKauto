# OpenLot

**Open, production-grade inventory-to-Marketplace listing platform for dealerships** — a clean-room alternative to commercial tools like Shiftly Auto.

OpenLot imports dealership inventory (CSV/DMS/website feeds), generates compliant listing descriptions (AI-assisted with a deterministic fallback), assists salespeople through a **human-in-the-loop** Facebook Marketplace listing flow via a Chrome MV3 extension, and gives managers real-time accountability: per-salesperson activity, sold-vehicle alerts, price-change alerts, sync health and a full audit trail.

> ⚖️ **Compliance by design:** the extension never auto-publishes, never bypasses CAPTCHAs/anti-bot protections, and acts only on explicit user action. The salesperson always reviews and clicks Facebook's own Publish button.

## Repository layout

```
packages/shared      Domain library: VIN validation/decoding, CSV parsing, feed normalization,
                     description generator, Marketplace field mapping, zod schemas
apps/api             Fastify 5 REST API + Postgres-backed job queue + workers (Drizzle ORM, SQL migrations)
apps/web             Next.js 15 dealer dashboard (inventory, listings, team analytics, sync health,
                     notifications, audit log, settings)
apps/extension       Chrome Manifest V3 extension (popup sign-in, side-panel inventory,
                     Marketplace form auto-fill overlay)
```

## Quick start (local development)

Prereqs: Node ≥ 20, pnpm 10, PostgreSQL 16 (or use Docker for the DB only: `docker compose up db`).

```bash
pnpm install
pnpm -r build                      # builds shared → api → web → extension

cp .env.example apps/api/.env      # adjust DATABASE_URL if needed

pnpm db:migrate                    # apply SQL migrations
pnpm db:seed                       # demo dealership + accounts (password: OpenLot-Demo-1)

pnpm --filter @openlot/api dev     # API on :4000 (worker runs inline)
pnpm --filter @openlot/web dev     # dashboard on :3000
```

Demo logins (`OpenLot-Demo-1`): `owner@demomotors.test`, `manager@demomotors.test`, `sam@demomotors.test`, `dana@demomotors.test`, platform admin `admin@openlot.test`.

### Chrome extension

```bash
pnpm --filter @openlot/extension build
```

Then open `chrome://extensions`, enable Developer mode, **Load unpacked** → `apps/extension/dist`. Sign in from the toolbar popup (API URL configurable under "Server settings"), open the side panel, pick a vehicle and click **List on Marketplace**. The overlay on the Marketplace page auto-fills the form on your click; you review, add photos, and publish yourself. Confirm with **"I published it"** so the dashboard and manager analytics update.

## Quick start (Docker)

```bash
cp .env.example .env               # set JWT_SECRET (openssl rand -base64 32)
docker compose up --build          # db + api (:4000) + dedicated worker + web (:3000)
docker compose exec api node apps/api/dist/db/seed.js   # optional demo data
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm -r build` | Build all packages topologically |
| `pnpm lint` | ESLint (flat config) across the monorepo |
| `pnpm -r typecheck` | Strict TypeScript everywhere |
| `pnpm -r test` | 75 unit/integration/E2E tests — the API suite runs the real SQL migrations against embedded Postgres (PGlite), no services needed |
| `pnpm db:generate` | Regenerate SQL migrations after schema changes |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed demo data |

## Key features

- **Inventory ingestion** — CSV upload with per-row error reports, scheduled CSV/JSON URL feeds, VIN check-digit validation + NHTSA vPIC decoding, flexible header/value normalization ("Crew Cab Pickup" → `TRUCK`, "$8,995" → `899500`¢), price history.
- **Sold detection & alerts** — vehicles missing from a full-inventory source are marked sold and every salesperson with a live listing is alerted (extension badge + dashboard); reappearing vehicles are restored automatically.
- **Listings lifecycle** — DRAFT → PREPARED → ACTIVE → REMOVED/ENDED with full event history, duplicate prevention, stale-listing reminders and Marketplace URL capture.
- **AI descriptions** — OpenAI-compatible provider constrained to a vehicle fact sheet, with a deterministic template fallback so the feature works offline; tone + disclaimer configurable per dealership.
- **Manager analytics** — org KPIs, 30-day activity chart, per-salesperson published/active counts and last activity.
- **Operations** — Postgres-backed job queue (SKIP LOCKED claiming, exponential backoff, dead-letter + admin retry, dedupe keys), sync-run health reports, audit log, `/healthz` & `/readyz`, structured logs, rate limiting, RBAC, refresh-token rotation.

## Architecture, API contract & requirements

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the reconnaissance summary, assumptions, user stories with acceptance criteria, database schema, complete API contract, and the phased plan.

## Security notes

- scrypt password hashing (Node built-in), JWT access tokens (15 min) + rotating opaque refresh tokens (SHA-256 stored), sessions revoked on password change.
- Multi-tenant isolation enforced via a single `requireMembership` gate on every org route; platform-admin role for cross-tenant operations; audit entries carry actor + IP.
- Extension requests only `storage`, `tabs`, `sidePanel`, `alarms` and Facebook-scoped content scripts — a unit test fails CI if riskier permissions (`scripting`, `webRequest`, `cookies`, `debugger`) are added.
- Set a strong `JWT_SECRET` in production (startup refuses the dev default).

## License

MIT. "Shiftly", "Shiftly Auto", "Facebook" and "Meta" are trademarks of their respective owners, referenced for identification only.
