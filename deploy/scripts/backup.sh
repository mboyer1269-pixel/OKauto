#!/usr/bin/env bash
# Local PostgreSQL dump with basic integrity checks.
# Usage: backup.sh [--label <name>]
# Writes /opt/okauto/backups/suivia-<timestamp>[-label].dump
#
# Offsite upload + heartbeat run only for the nightly cron (no --label).
# A failed offsite never fails this script (deploy.sh must not roll back).
set -euo pipefail

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
BACKUP_ENV_FILE="${ROOT}/backup.env"
COMPOSE_FILE="${ROOT}/compose.prod.yml"
BACKUP_DIR="${ROOT}/backups"

label=""
if [[ "${1:-}" == "--label" ]]; then
  label="-${2:?missing label}"
fi

mkdir -p "$BACKUP_DIR"
# shellcheck disable=SC1090
set -a
# App secrets for compose (POSTGRES_*). Backup/R2 keys live in backup.env.
source "$ENV_FILE"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  source "$BACKUP_ENV_FILE"
fi
set +a

MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if [[ ! "$MIN_BYTES" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_MIN_BYTES=${MIN_BYTES:-empty} is invalid; using 10240" >&2
  MIN_BYTES=10240
fi
if [[ ! "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS=${RETENTION_DAYS:-empty} is invalid; using 14" >&2
  RETENTION_DAYS=14
fi

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

if [[ -n "$label" ]]; then
  echo "offsite backup skipped: labeled dump (deploy keeps local only)"
  echo "heartbeat skipped: labeled dump"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
offsite_ok=0
if [[ -x "${SCRIPT_DIR}/offsite-backup.sh" ]]; then
  if "${SCRIPT_DIR}/offsite-backup.sh" "$dump"; then
    offsite_ok=1
  else
    echo "offsite backup failed (local dump kept): $dump" >&2
  fi
else
  echo "offsite backup skipped: script not installed"
  offsite_ok=1
fi

if [[ "$offsite_ok" -ne 1 ]]; then
  echo "heartbeat skipped: offsite failed"
  exit 0
fi

if [[ -z "${BACKUP_HEARTBEAT_URL:-}" ]]; then
  echo "heartbeat skipped: BACKUP_HEARTBEAT_URL unset"
else
  if curl -fsS --max-time 10 --output /dev/null "${BACKUP_HEARTBEAT_URL}"; then
    echo "heartbeat ping ok"
  else
    echo "heartbeat ping failed" >&2
  fi
fi
