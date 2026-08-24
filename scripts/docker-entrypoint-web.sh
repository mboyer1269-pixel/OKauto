#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy

if [ "${RUN_EMBEDDED_WORKER:-false}" = "true" ]; then
  echo "Starting the embedded Suivia Auto worker..."
  cd /app
  node apps/worker/dist/index.js &
fi

echo "Starting Suivia Auto web server..."
cd /app
exec node apps/web/server.js
