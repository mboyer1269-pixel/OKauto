# LotPilot

**List, manage, and track dealership inventory on Facebook Marketplace.**

LotPilot is a production-grade, clean-room alternative to commercial dealer listing tools
(functional reference: the publicly observable capabilities of Shiftly Auto). It gives
dealerships a dealer dashboard, automated inventory sync with sold-vehicle alerts, AI-assisted
compliant descriptions, per-salesperson listing analytics, and a Chrome extension that assists a
human through the Marketplace listing flow — **without ever posting automatically or bypassing
platform protections**.

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the full product recon, user stories, architecture,
schema, and API contracts.

## What's in the box

| Piece                       | Path             | Description                                                                                                                                    |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dealer dashboard + REST API | `apps/web`       | Next.js 15 App Router; API under `/api/v1/*`                                                                                                   |
| Job worker                  | `apps/worker`    | Feed polling, sold/price-change detection, notifications, email fan-out (BullMQ or inline scheduler)                                           |
| Chrome extension (MV3)      | `apps/extension` | Popup + Marketplace fill-assist overlay                                                                                                        |
| Domain library              | `packages/core`  | VIN validation/decode, normalization, dedupe, CSV/feed mapping, sync diffing, compliant description generator, Marketplace field mapping, RBAC |
| Data layer                  | `packages/db`    | Prisma schema, migrations, seed, shared sync engine                                                                                            |

### Feature highlights

- **Auth & multi-tenancy** — email/password sessions (HttpOnly JWT cookie), organizations
  (dealerships), invitations, RBAC (`OWNER` / `MANAGER` / `SALESPERSON` + platform `ADMIN`).
- **Inventory ingestion** — CSV upload, scheduled JSON/CSV feed polling with configurable field
  mapping, manual entry with NHTSA VIN decode (offline fallback). Rows are normalized and
  de-duplicated by VIN → stock number → fingerprint; re-imports are idempotent.
- **Sold & price-change detection** — vehicles missing from N consecutive syncs are marked sold;
  active listers get "delist now" alerts; price changes notify and are recorded as history.
- **AI-assisted descriptions** — OpenAI-compatible provider when `OPENAI_API_KEY` is set, with a
  deterministic compliant template engine as an always-available fallback. Output is scrubbed of
  risky claims and org disclaimers are appended.
- **Human-in-the-loop listing workflow** — DRAFT → PREPARED → POSTED (with the Marketplace URL
  the human confirms) → DELISTED, with a full `ListingEvent` audit trail and duplicate
  prevention (self-conflicts blocked; teammate conflicts warn and require `force`).
- **Extension** — popup shows pending delists and inventory; the overlay on
  `facebook.com/marketplace` fills supported text fields one explicit click at a time, degrades
  to copy-mode when Facebook changes its form (selector drift), and never clicks Facebook's
  buttons.
- **Dashboard** — overview with action alerts, inventory with bulk actions, vehicle detail with
  description editor and listing history, all-listings view, salesperson analytics, sync health
  with per-run stats and retry, team management, org settings, API tokens, audit log,
  notifications, platform admin. Mobile-responsive and keyboard-accessible.
- **Observability & ops** — structured JSON logs with request IDs, `/api/health` with DB +
  worker-heartbeat checks, per-source sync run history, rate limiting on sensitive endpoints.

## Quick start (Docker)

```bash
cp .env.example .env         # then set SESSION_SECRET
docker compose up --build
```

This starts Postgres, Redis, migrations, the web app on http://localhost:3000, and the worker.
Seed demo data with:

```bash
docker compose run --rm web sh -c "cd /app && pnpm --filter @lotpilot/db seed"
```

## Quick start (local dev)

Prereqs: Node 20+, pnpm 9+, PostgreSQL (and optionally Redis).

```bash
pnpm install
cp .env.example .env                       # set DATABASE_URL + SESSION_SECRET

pnpm --filter @lotpilot/db generate        # Prisma client
pnpm db:migrate                            # apply migrations
pnpm db:seed                               # demo dealership + users

pnpm dev                                   # web on http://localhost:3000
pnpm dev:worker                            # in a second terminal
```

### Demo logins (password `demo-password-123`)

| Email                                               | Role             |
| --------------------------------------------------- | ---------------- |
| `owner@sunrisemotors.test`                          | Dealership owner |
| `manager@sunrisemotors.test`                        | Manager          |
| `alex@sunrisemotors.test`, `bri@sunrisemotors.test` | Salespeople      |
| `admin@lotpilot.test`                               | Platform admin   |

### Chrome extension

```bash
pnpm --filter @lotpilot/extension build
```

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select
   `apps/extension/dist`.
2. In the dashboard go to **Settings → Extension API tokens**, create a token, and paste it into
   the extension popup (server URL: your LotPilot URL, e.g. `http://localhost:3000`).
   The seed also prints a ready-made demo token.
3. Open [facebook.com/marketplace/create/vehicle](https://www.facebook.com/marketplace/create/vehicle),
   click the **LotPilot** button, pick a vehicle, fill/copy fields, attach photos yourself,
   review, and publish with Facebook's own button. Then record the listing URL in the panel.

## Testing & quality gates

```bash
pnpm lint                                  # ESLint (typescript-eslint) across the repo
pnpm format:check                          # Prettier
pnpm typecheck                             # strict TS in every package
pnpm --filter @lotpilot/core test          # 51 domain unit tests
pnpm --filter @lotpilot/web test           # web unit tests
pnpm --filter @lotpilot/web test:integration   # 16 API tests against real Postgres
pnpm --filter @lotpilot/web test:e2e       # Playwright E2E (requires seeded DB)
pnpm build                                 # web + worker + extension builds
```

CI (`.github/workflows/ci.yml`) runs lint → format → typecheck → unit tests → integration tests
(Postgres service) → builds → Playwright E2E on every push/PR.

## Configuration

All configuration is environment-based — see [.env.example](./.env.example). Notable:

| Variable                                              | Purpose                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                                        | PostgreSQL connection string (required)                          |
| `SESSION_SECRET`                                      | Signs session JWTs (required in production)                      |
| `REDIS_URL`                                           | Enables BullMQ mode in the worker; omit for the inline scheduler |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | Optional AI descriptions                                         |
| `SMTP_URL` / `EMAIL_FROM`                             | Optional email notifications (logged when unset)                 |
| `VIN_DECODER_ONLINE`                                  | Set `false` to force the offline VIN decoder                     |

## Compliance & security posture

- **No automation of Facebook** — the extension only assists a signed-in human: explicit
  per-click field fills, clipboard helpers, and manual publish/delist confirmation. It never
  clicks Facebook buttons, auto-submits, scrapes, or touches CAPTCHA/anti-bot/rate-limit
  mechanisms, in line with Meta ToS and Chrome Web Store policies.
- Passwords bcrypt(12); API tokens and invite tokens stored as SHA-256 hashes and shown once.
- Session cookies HttpOnly / SameSite=Lax / Secure in production; extension endpoints use
  bearer tokens (no cookies), so CORS for them is safe.
- Every org-scoped route goes through a single `requireOrgRole` guard; salespeople are further
  restricted to their own listings/tokens.
- Zod validation on every input boundary; rate limiting on auth, VIN decode, describe, and
  manual sync; mutating actions written to the audit log with actor + IP.
- Security headers (X-Frame-Options, nosniff, referrer policy) on all responses.

## Repository layout

```
apps/
  web/         Next.js dashboard + REST API (+ unit/integration/E2E tests)
  worker/      job runner (BullMQ or inline)
  extension/   Chrome MV3 extension (esbuild)
packages/
  core/        pure domain logic (+ unit tests)
  db/          Prisma schema, migrations, seed, sync engine
docker/        production Dockerfiles
.github/       CI pipeline
```

## License

MIT
