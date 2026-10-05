#!/usr/bin/env bash
# Non-destructive restore drill: last dump -> okauto_drill -> drop.
set -euo pipefail

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
COMPOSE_FILE="${ROOT}/compose.prod.yml"
BACKUP_DIR="${ROOT}/backups"
DRILL_DB="okauto_drill"

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

dump="${1:-}"
if [[ -z "$dump" ]]; then
  dump="$(ls -1t "${BACKUP_DIR}"/suivia-*.dump 2>/dev/null | head -1 || true)"
fi
if [[ -z "$dump" || ! -f "$dump" ]]; then
  echo "no dump found in ${BACKUP_DIR}" >&2
  exit 1
fi

echo "restore-drill using ${dump}"

compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);" \
  -c "CREATE DATABASE ${DRILL_DB} OWNER ${POSTGRES_USER};"

set +e
compose exec -T postgres pg_restore -U "${POSTGRES_USER}" -d "${DRILL_DB}" --no-owner --no-acl <"$dump"
restore_rc=$?
set -e
if [[ "$restore_rc" -gt 1 ]]; then
  echo "pg_restore failed (exit ${restore_rc})" >&2
  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);"
  exit 1
fi

compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) AS organizations FROM organizations;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS vehicles FROM vehicles;
SQL

compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB} WITH (FORCE);"
echo "restore-drill ok"
