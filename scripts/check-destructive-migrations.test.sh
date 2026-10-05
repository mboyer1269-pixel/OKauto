#!/usr/bin/env bash
# Fixtures for scripts/check-destructive-migrations.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK="$ROOT/scripts/check-destructive-migrations.sh"
FIX="$ROOT/scripts/fixtures/destructive-migrations"
fail=0

expect_ok() {
  local dir="$1" label="$2"
  if ! "$CHECK" "$dir" >/tmp/destructive-ok.out 2>/tmp/destructive-ok.err; then
    echo "FAIL $label: expected success" >&2
    cat /tmp/destructive-ok.out /tmp/destructive-ok.err >&2 || true
    fail=1
  else
    echo "ok $label"
  fi
}

expect_fail() {
  local dir="$1" label="$2" needle="$3"
  if "$CHECK" "$dir" >/tmp/destructive-fail.out 2>/tmp/destructive-fail.err; then
    echo "FAIL $label: expected destructive detection" >&2
    fail=1
    return
  fi
  if ! grep -qi "$needle" /tmp/destructive-fail.err; then
    echo "FAIL $label: stderr missing '$needle'" >&2
    cat /tmp/destructive-fail.err >&2 || true
    fail=1
    return
  fi
  echo "ok $label"
}

expect_ok "$FIX/clean" "clean CREATE INDEX"
expect_fail "$FIX/flagged-drop-index" "DROP INDEX" "DROP INDEX"
expect_fail "$FIX/flagged-truncate" "TRUNCATE" "TRUNCATE"
expect_ok "$FIX/overridden" "ALLOW_DESTRUCTIVE override"

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "destructive-migration fixtures ok"
