#!/usr/bin/env bash
# Local PostgreSQL dump with basic integrity checks.
# Usage: backup.sh [--label <name>]
# Writes /opt/okauto/backups/suivia-<timestamp>[-label].dump
set -euo pipefail

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
COMPOSE_FILE="${ROOT}/compose.prod.yml"
BACKUP_DIR="${ROOT}/backups"
MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

label=""
if [[ "${1:-}" == "--label" ]]; then
  label="-${2:?missing label}"
fi

mkdir -p "$BACKUP_DIR"
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="${BACKUP_DIR}/suivia-${stamp}${label}.dump"

compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc >"$dump"

size="$(wc -c <"$dump")"
if [[ "$size" -lt "$MIN_BYTES" ]]; then
  echo "backup too small (${size} bytes, min ${MIN_BYTES}): $dump" >&2
  rm -f "$dump"
  exit 1
fi

if ! compose exec -T postgres pg_restore -l <"$dump" >/dev/null; then
  echo "pg_restore -l failed for $dump" >&2
  rm -f "$dump"
  exit 1
fi

echo "backup ok ${dump} (${size} bytes)"

find "$BACKUP_DIR" -name 'suivia-*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete
