#!/usr/bin/env bash
# Fixtures for deploy/scripts/persist-app-version.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/scripts/persist-app-version.sh"
SHA_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SHA_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"

printf 'JWT_SECRET=keep-me\nAPP_VERSION=\nREDIS_URL=redis://redis:6379\n' >"$tmp"
"$SCRIPT" "$tmp" "$SHA_A"
grep -qx "APP_VERSION=${SHA_A}" "$tmp"
grep -qx "JWT_SECRET=keep-me" "$tmp"
grep -qx "REDIS_URL=redis://redis:6379" "$tmp"
test "$(stat -c '%a' "$tmp")" = "600"

"$SCRIPT" "$tmp" "$SHA_B"
grep -qx "APP_VERSION=${SHA_B}" "$tmp"
grep -qx "JWT_SECRET=keep-me" "$tmp"
# no duplicate APP_VERSION
test "$(grep -c '^APP_VERSION=' "$tmp")" -eq 1

# append when missing
printf 'ONLY=one\n' >"$tmp"
chmod 600 "$tmp"
"$SCRIPT" "$tmp" "$SHA_A"
grep -qx "ONLY=one" "$tmp"
grep -qx "APP_VERSION=${SHA_A}" "$tmp"

echo "persist-app-version fixtures ok"
