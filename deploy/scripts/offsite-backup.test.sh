#!/usr/bin/env bash
# Fixtures for deploy/scripts/offsite-backup.sh (same style as persist-app-version.test.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/scripts/offsite-backup.sh"
R2_PY="$ROOT/deploy/scripts/r2.py"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "${tmp}/backups" "${tmp}/scripts"
chmod 700 "$tmp"
cp -a "$R2_PY" "${tmp}/scripts/r2.py"
# The script lives next to r2.py in production; for tests we invoke SCRIPT
# but point OKAUTO_ROOT at the fixture tree.

printf 'POSTGRES_USER=okauto\nJWT_SECRET=keep-me\n' >"${tmp}/.env"
chmod 600 "${tmp}/.env"
# Fake custom-format dump (just needs to exist; offsite does not parse it)
printf 'fake-pg-dump' >"${tmp}/backups/suivia-20260101T000000Z.dump"

# 1. R2 unset → skip, exit 0
out="$(OKAUTO_ROOT="$tmp" bash "$SCRIPT" 2>&1)"
printf '%s\n' "$out" | grep -q 'offsite backup skipped: R2 not configured'
test ! -e "${tmp}/backups/suivia-20260101T000000Z.tar.gz.age"

# 2. Partial R2 (endpoint only) still counts as not configured
out="$(OKAUTO_ROOT="$tmp" BACKUP_R2_ENDPOINT=https://example.r2.cloudflarestorage.com bash "$SCRIPT" 2>&1)"
printf '%s\n' "$out" | grep -q 'offsite backup skipped: R2 not configured'

# 3. R2 fully set but no age recipient → refuse plaintext upload
set +e
out="$(
  OKAUTO_ROOT="$tmp" \
  BACKUP_R2_ENDPOINT=https://example.r2.cloudflarestorage.com \
  BACKUP_R2_BUCKET=suivia-backups \
  BACKUP_R2_ACCESS_KEY_ID=akid \
  BACKUP_R2_SECRET_ACCESS_KEY=secret \
  bash "$SCRIPT" 2>&1
)"
rc=$?
set -e
test "$rc" -eq 1
printf '%s\n' "$out" | grep -q 'BACKUP_AGE_RECIPIENT unset'

# 4. Local encrypt (no R2) when age is available
if command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1; then
  age-keygen -o "${tmp}/identity" >/dev/null
  recipient="$(awk '/public key:/{print $NF}' "${tmp}/identity")"
  test -n "$recipient"
  out="$(
    OKAUTO_ROOT="$tmp" \
    BACKUP_AGE_RECIPIENT="$recipient" \
    BACKUP_KEEP_ENCRYPTED_LOCAL=1 \
    bash "$SCRIPT" "${tmp}/backups/suivia-20260101T000000Z.dump" 2>&1
  )"
  printf '%s\n' "$out" | grep -q 'offsite upload skipped: R2 not configured'
  test -f "${tmp}/backups/suivia-20260101T000000Z.tar.gz.age"
  age -d -i "${tmp}/identity" -o "${tmp}/out.tar.gz" "${tmp}/backups/suivia-20260101T000000Z.tar.gz.age"
  tar -tzf "${tmp}/out.tar.gz" | grep -qx database.dump
  tar -tzf "${tmp}/out.tar.gz" | grep -qx env
  tar -C "$tmp" -xzf "${tmp}/out.tar.gz" env
  grep -qx 'JWT_SECRET=keep-me' "${tmp}/env"
else
  echo "age not installed — skip encrypt fixture"
fi

python3 "$R2_PY" --self-test

echo "offsite-backup fixtures ok"
