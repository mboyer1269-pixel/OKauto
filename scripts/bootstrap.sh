#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp -n "$ROOT/.env.example" "$ROOT/.env" || true
cp "$ROOT/.env" "$ROOT/apps/api/.env"
echo "Installing dependencies…"
pnpm install
echo "Building shared…"
pnpm --filter @okauto/shared build
echo "Generating Prisma client…"
pnpm --filter @okauto/api prisma:generate
echo "Migrating…"
pnpm --filter @okauto/api prisma:migrate
echo "Seeding…"
pnpm --filter @okauto/api prisma:seed
echo "Done. Start with:"
echo "  pnpm --filter @okauto/api dev"
echo "  pnpm --filter @okauto/worker dev"
echo "  pnpm --filter @okauto/web dev"
