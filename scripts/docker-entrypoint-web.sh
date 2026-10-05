#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
  echo "Running database migrations (RUN_MIGRATIONS_ON_BOOT=true)..."
  cd /app/packages/database
  npx prisma migrate deploy
fi

echo "Starting Suivia Auto web server..."
cd /app
exec node apps/web/server.js
