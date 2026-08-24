#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# npm launches Git Bash with a reduced PATH on some Windows installations.
if [ -x "/c/Program Files/nodejs/node.exe" ]; then
  export PATH="/c/Program Files/nodejs:$PATH"
fi

echo "==> Suivia Auto — démarrage local"
echo ""

# 1. .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ .env créé depuis .env.example"
fi

# Export the local environment for Prisma and seed commands.
# Strip carriage returns so Windows checkouts with CRLF remain sourceable.
set -a
# shellcheck disable=SC1090
source <(sed 's/\r$//' "$ROOT/.env")
set +a

# 2. Postgres + Redis (Docker si dispo, sinon services système)
if command -v docker >/dev/null 2>&1; then
  echo "==> Démarrage Postgres + Redis (Docker)..."
  docker compose up -d postgres redis
  sleep 3
else
  echo "==> Docker absent — vérifiez que Postgres et Redis tournent localement"
  if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -h localhost -q 2>/dev/null; then
    echo "ERREUR: PostgreSQL n'est pas démarré."
    echo "  macOS: brew services start postgresql@16"
    echo "  Linux: sudo service postgresql start"
    exit 1
  fi
fi

# 3. Dépendances + DB
echo "==> Installation et base de données..."
pnpm install
pnpm db:generate
pnpm --filter @okauto/database exec prisma migrate deploy 2>/dev/null || pnpm db:push
pnpm db:seed
pnpm --filter @okauto/extension build

echo ""
echo "============================================"
echo "  Suivia Auto est prêt !"
echo "  Ouvrez: http://localhost:3000"
echo "  Login:  owner@demo.okauto.local / Demo1234!"
echo "  Extension prête dans apps/extension/dist"
echo "============================================"
echo ""
echo "Démarrage du serveur web et de la synchronisation (Ctrl+C pour arrêter)..."
echo ""

pnpm --filter @okauto/worker dev &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" 2>/dev/null || true
  wait "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm --filter @okauto/web dev
