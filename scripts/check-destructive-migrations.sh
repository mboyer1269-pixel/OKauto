#!/usr/bin/env bash
# Fail if a Prisma migration contains contract/destructive SQL unless the
# same folder contains an ALLOW_DESTRUCTIVE file (explicit override).
#
# Policy: expand/contract. New columns/tables are additive. Drops, renames,
# ALTER TYPE, and SET NOT NULL without a staged default require the override
# and a documented restore path — automatic image rollback does not undo schema.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS="$ROOT/packages/database/prisma/migrations"
pattern='(^|[[:space:]])(DROP[[:space:]]+(TABLE|COLUMN|TYPE)|RENAME[[:space:]]+(COLUMN|TO)|ALTER[[:space:]]+TYPE|ALTER[[:space:]]+COLUMN[[:space:]].*[[:space:]]TYPE|SET[[:space:]]+NOT[[:space:]]+NULL)'

if [[ ! -d "$MIGRATIONS" ]]; then
  echo "no migrations directory" >&2
  exit 1
fi

failed=0
while IFS= read -r -d '' sql; do
  dir="$(dirname "$sql")"
  rel="${sql#"$ROOT"/}"
  if [[ -f "$dir/ALLOW_DESTRUCTIVE" ]]; then
    echo "OK (override) $rel"
    continue
  fi
  stripped="$(grep -vE '^[[:space:]]*--' "$sql" || true)"
  if echo "$stripped" | grep -Eiq "$pattern"; then
    echo "DESTRUCTIVE SQL in $rel" >&2
    echo "$stripped" | grep -Ein "$pattern" >&2 || true
    echo "Add packages/database/prisma/migrations/<name>/ALLOW_DESTRUCTIVE (one-line reason) if this expand/contract exception is intentional." >&2
    failed=1
  fi
done < <(find "$MIGRATIONS" -name '*.sql' -print0 | sort -z)

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
echo "No unapproved destructive migrations."
