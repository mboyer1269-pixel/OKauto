#!/bin/sh
# Copy generated Prisma client files to node_modules/@prisma/client and
# node_modules/.prisma/client so `import('@prisma/client')` works from the
# image workdir without relying on pnpm virtual-store layout.
set -eu
ROOT="${1:-.}"
cd "$ROOT"

client_pkg="$(find node_modules -path '*/@prisma/client/package.json' | head -1 || true)"
if [ -z "$client_pkg" ]; then
  echo "hoist-prisma: @prisma/client not found under $(pwd)/node_modules" >&2
  find node_modules -name 'package.json' | head -50 >&2 || true
  exit 1
fi

client_dir="$(dirname "$client_pkg")"
dest_client="node_modules/@prisma/client"
mkdir -p node_modules/@prisma
if [ "$(readlink -f "$client_dir")" != "$(readlink -f "$dest_client" 2>/dev/null || true)" ]; then
  rm -rf "$dest_client"
  cp -a "$client_dir" "$dest_client"
fi

engine_schema="$(find node_modules -path '*/.prisma/client/schema.prisma' | head -1 || true)"
if [ -z "$engine_schema" ]; then
  echo "hoist-prisma: generated .prisma/client not found (run prisma generate first)" >&2
  exit 1
fi
engine_dir="$(dirname "$engine_schema")"
dest_engine="node_modules/.prisma/client"
mkdir -p node_modules/.prisma
if [ "$(readlink -f "$engine_dir")" != "$(readlink -f "$dest_engine" 2>/dev/null || true)" ]; then
  rm -rf "$dest_engine"
  cp -a "$engine_dir" "$dest_engine"
fi

echo "hoist-prisma: client=$dest_client engine=$dest_engine"
