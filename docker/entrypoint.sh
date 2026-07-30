#!/usr/bin/env bash
set -euo pipefail

# Entrypoint for the OKauto container. Usage: entrypoint.sh [web|worker]
ROLE="${1:-web}"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[okauto] applying database migrations..."
  pnpm --filter @okauto/db migrate || echo "[okauto] migrate step failed (continuing)"
fi

case "$ROLE" in
  web)
    echo "[okauto] starting web on 0.0.0.0:${PORT:-3000}"
    exec pnpm --filter @okauto/web start
    ;;
  worker)
    echo "[okauto] starting background worker"
    exec pnpm --filter @okauto/web worker
    ;;
  *)
    echo "Unknown role: $ROLE (expected web|worker)"
    exit 1
    ;;
esac
