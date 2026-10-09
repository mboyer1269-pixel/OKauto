# OKauto

**Production-grade dealership Facebook Marketplace listing platform** — a clean-room alternative built for inventory management, team analytics, AI-assisted descriptions, and human-in-the-loop Chrome extension listing assist.

## Features

- **Dealership Dashboard** — Inventory CRUD, CSV import, VIN decode (NHTSA), AI/template descriptions
- **Team Management** — RBAC (Owner, Admin, Manager, Salesperson), pending invitations, audit logs
- **Listing Tracking** — Per-salesperson analytics, listing history, stale listing detection
- **Sold Vehicle Alerts** — Notifications when inventory is marked sold
- **Chrome Extension (MV3)** — Human-in-the-loop Marketplace form assist (no auto-bypass)
- **API Keys** — Secure extension authentication
- **Background Worker** — BullMQ job processing for sync, VIN decode catch-up, and notifications
- **Docker** — Full stack with PostgreSQL and Redis

### Décodage NIV (NHTSA vPIC, gratuit)

Le décodage ne remplit **que les champs vides**. La version, les options et les autres données du site du concessionnaire priment toujours sur vPIC.

- Formulaire d’ajout : un NIV valide de 17 caractères est décodé tout seul.
- Synchro et parc existant : le worker enrichit automatiquement les NIV pas encore décodés (`vinDecodedAt` vide), 50 par minute, 1 appel vPIC / ~1,1 s. Une valeur vide du site n’écrase jamais un champ **enregistré** dans `vinDecodedFields` ; une valeur non vide du concessionnaire gagne toujours. Une liste vide ne protège aucun champ.
- **Rattrapage (~203 véhicules)** : au déploiement, le worker démarre un job `vin-decode` tout de suite, puis toutes les minutes jusqu’à ce que la file soit vide. Durée estimée : **environ 5 minutes** (203 × 1,1 s de vPIC, par lots de 50). Relançable sans risque : un NIV déjà tamponné est ignoré.
- Commande manuelle (optionnelle), après `pnpm --filter @okauto/worker build` : `pnpm --filter @okauto/worker vin-decode` (exécute `node dist/vin-decode-cli.js`). Dans l’image worker : `node dist/vin-decode-cli.js`. Requiert `DATABASE_URL`.

### Mention Carfax dans les annonces Marketplace

Pour les **occasions et démonstrateurs** seulement (pas les neufs) : « Rapport Carfax gratuit disponible, écrivez-nous ! » — **sans URL** par défaut. Option (désactivée) pour coller `sourceUrl` à la place : un véhicule (test) ou Paramètres (partout).

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

> **Important** : le fichier `.env` doit être à la racine du projet (`okauto/.env`). Les scripts `dev` le chargent automatiquement.

### Dépannage localhost

| Problème | Solution |
|----------|----------|
| Page inaccessible | Vérifiez que le serveur tourne : `pnpm --filter @okauto/web dev` |
| Login échoue / DB error | PostgreSQL doit être démarré : `docker compose up -d postgres redis` puis `pnpm db:push && pnpm db:seed` |
| Port 3000 occupé | Tuez l'autre processus ou changez le port : `next dev --port 3001` |

**Commande tout-en-un (recommandée)** :

```bash
docker compose up -d postgres redis && pnpm install && cp -n .env.example .env && pnpm db:generate && pnpm db:push && pnpm db:seed && pnpm --filter @okauto/web dev
```

### Comptes démo (local / CI seulement)

Ces comptes **ne doivent jamais être créés en production** (`NODE_ENV=production` bloque le seed, sauf `ALLOW_DEMO_SEED=true` sur une base jetable).

| Rôle | Courriel (environnement local) |
|------|--------------------------------|
| Owner | owner@demo.okauto.local |
| Manager | manager@demo.okauto.local |
| Salesperson | sales@demo.okauto.local |

Le mot de passe local est affiché uniquement par `pnpm db:seed` dans le terminal. Ne le copiez pas dans la documentation de production.

### Invitations d’équipe

L’app **n’envoie aucun courriel**. Un administrateur crée une invitation ; le lien (jeton à usage unique, 7 jours) s’affiche **une seule fois** et doit être copié puis transmis hors bande. S’il existe déjà un compte, le titulaire doit être **connecté avec ce courriel** pour accepter (aucun mot de passe n’est accepté sur cette route). Un compte actif sans organisation se connecte via `/login?next=/invitation/<jeton>` : le login délivre un jeton `scope: invitation` (environ 10 min), accepté seulement par la route d’acceptation. Sinon, il choisit lui-même son mot de passe en ouvrant le lien — la concession ne le connaît jamais.

**Risque accepté par conception** : quiconque possède le lien d’une invitation pour un courriel **inexistant** peut créer ce compte. Ne transmettez le lien qu’au destinataire.

Les comptes déjà rattachés à plusieurs concessions n’ont pas de « concession créatrice » : une concession ne peut pas en réinitialiser le mot de passe. Audit lecture seule : `deploy/audit-memberships.sql`.

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
├── deploy/         # Production compose, SSH deploy, runbook (Hostinger VPS)
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
pnpm test:unit         # Fast tests (no database required for most packages)
pnpm test:int          # Integration tests (Postgres + Redis)
pnpm typecheck         # TypeScript, all packages
pnpm lint              # ESLint (web, worker, shared, extension)
pnpm --filter @okauto/web test:e2e  # Playwright E2E
```

## Docker (Full Stack)

```bash
docker compose up --build
```

A one-shot `migrate` service runs `prisma migrate deploy`, then `web` and `worker` start. The worker uses `Dockerfile.worker` (not the web image).

## Production (Hostinger VPS)

Production is **not** Render. Images are built in GitHub Actions, pushed to **private** GHCR packages tagged by git SHA, and deployed over SSH to `/opt/okauto` behind the existing shared Traefik v3 (`network_mode: host`). Deployments to `main` require a GitHub Environment `production` approval. The VPS pulls with `docker login ghcr.io` (read-only `read:packages` PAT, root-only).

See [`deploy/README.md`](deploy/README.md) and [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md). `render.yaml` is obsolete.

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
