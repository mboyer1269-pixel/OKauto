#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy

echo "Starting OKauto web server..."
cd /app
exec node apps/web/server.js
