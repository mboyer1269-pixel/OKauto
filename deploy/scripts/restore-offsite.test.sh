#!/usr/bin/env bash
# Fixtures for deploy/scripts/restore-offsite.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/scripts/restore-offsite.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 1. No identity → skip (exit 0) so GHA stays green before secrets exist
out="$(OKAUTO_ROOT="$tmp" bash "$SCRIPT" --bundle /no/such.age 2>&1 || true)"
printf '%s\n' "$out" | grep -q 'age identity not provided'

if ! command -v age >/dev/null 2>&1 || ! command -v age-keygen >/dev/null 2>&1; then
  echo "age not installed — skip decrypt fixture"
  echo "restore-offsite fixtures ok"
  exit 0
fi

age-keygen -o "${tmp}/identity" >/dev/null
recipient="$(awk '/public key:/{print $NF}' "${tmp}/identity")"
test -n "$recipient"

mkdir -p "${tmp}/bundle"
printf 'not-a-real-dump' >"${tmp}/bundle/database.dump"
printf 'JWT_SECRET=keep-me\n' >"${tmp}/bundle/env"
printf 'BACKUP_R2_BUCKET=suivia-backups\n' >"${tmp}/bundle/backup.env"
printf 'fixture\n' >"${tmp}/bundle/stamp"
tar -C "${tmp}/bundle" -czf "${tmp}/bundle.tar.gz" database.dump env backup.env stamp
age -r "$recipient" -o "${tmp}/bundle.tar.gz.age" "${tmp}/bundle.tar.gz"

RESTORE_SKIP_DOCKER=1 \
  BACKUP_AGE_IDENTITY_FILE="${tmp}/identity" \
  bash "$SCRIPT" --bundle "${tmp}/bundle.tar.gz.age" | tee "${tmp}/restore.out"
grep -q 'restore-offsite: decrypted ok' "${tmp}/restore.out"
grep -q 'database.dump' "${tmp}/restore.out"

echo "restore-offsite fixtures ok"
