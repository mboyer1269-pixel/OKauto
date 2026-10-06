#!/usr/bin/env bash
# Decrypt an age-encrypted offsite bundle and restore into a throwaway Postgres
# container. The age identity (private key) must NOT live on the production VPS.
#
# Usage:
#   restore-offsite.sh --bundle FILE [--identity FILE]
#   restore-offsite.sh --latest
#   restore-offsite.sh --key <r2-key>
#
# Identity: --identity, BACKUP_AGE_IDENTITY_FILE, or BACKUP_AGE_IDENTITY (contents).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R2_PY="${SCRIPT_DIR}/r2.py"
ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
BACKUP_ENV_FILE="${ROOT}/backup.env"
BUNDLE=""
KEY=""
LATEST=0
IDENTITY_FILE=""
POSTGRES_IMAGE="${RESTORE_POSTGRES_IMAGE:-postgres:16-alpine}"
MIN_ORGS="${RESTORE_MIN_ORGS:-1}"
MIN_USERS="${RESTORE_MIN_USERS:-1}"
MIN_VEHICLES="${RESTORE_MIN_VEHICLES:-100}"

# shellcheck disable=SC1090
set -a
if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  source "$BACKUP_ENV_FILE"
fi
set +a

usage() {
  echo "usage: restore-offsite.sh --bundle FILE | --latest | --key R2_KEY [--identity FILE]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle) BUNDLE="${2:?}"; shift 2 ;;
    --key) KEY="${2:?}"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    --identity) IDENTITY_FILE="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done

if [[ -z "${IDENTITY_FILE}" && -n "${BACKUP_AGE_IDENTITY_FILE:-}" ]]; then
  IDENTITY_FILE="$BACKUP_AGE_IDENTITY_FILE"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/okauto-restore.XXXXXX")"
cleanup() {
  if [[ -n "${CID:-}" ]]; then
    docker rm -fv "$CID" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

if [[ -z "$IDENTITY_FILE" && -n "${BACKUP_AGE_IDENTITY:-}" ]]; then
  IDENTITY_FILE="${work}/identity"
  umask 077
  printf '%s\n' "$BACKUP_AGE_IDENTITY" >"$IDENTITY_FILE"
fi

if [[ -z "$IDENTITY_FILE" || ! -f "$IDENTITY_FILE" ]]; then
  echo "restore-offsite skipped: age identity not provided (BACKUP_AGE_IDENTITY / --identity)" >&2
  exit 0
fi

if ! command -v age >/dev/null 2>&1; then
  echo "restore-offsite failed: age is not installed" >&2
  exit 1
fi

if [[ "$LATEST" -eq 1 || -n "$KEY" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "restore-offsite failed: python3 is required to pull from R2" >&2
    exit 1
  fi
  prefix="${BACKUP_R2_PREFIX:-suivia}"
  prefix="${prefix%/}"
  if [[ -z "$KEY" ]]; then
    KEY="$(python3 "$R2_PY" list --prefix "${prefix}/" | awk 'NF{print $NF}' | tail -1 || true)"
  fi
  if [[ -z "$KEY" ]]; then
    echo "restore-offsite skipped: no objects under ${prefix}/" >&2
    exit 0
  fi
  echo "restore-offsite downloading ${KEY}"
  RESTORE_SCRIPT_DIR="$SCRIPT_DIR" RESTORE_R2_KEY="$KEY" RESTORE_OUT="${work}/bundle.tar.gz.age" python3 - <<'PY'
import os, sys
sys.path.insert(0, os.environ["RESTORE_SCRIPT_DIR"])
import r2
cfg = r2.R2Config()
missing = cfg.missing()
if missing:
    raise SystemExit("R2 not configured: missing " + ", ".join(missing))
key = os.environ["RESTORE_R2_KEY"]
status, _headers, body = r2._request(cfg, "GET", key)
if status != 200:
    raise SystemExit(f"R2 get unexpected status {status}")
open(os.environ["RESTORE_OUT"], "wb").write(body)
print(f"downloaded {len(body)} bytes")
PY
  BUNDLE="${work}/bundle.tar.gz.age"
fi

if [[ -z "$BUNDLE" || ! -f "$BUNDLE" ]]; then
  echo "restore-offsite: no bundle to restore" >&2
  exit 1
fi

age -d -i "$IDENTITY_FILE" -o "${work}/bundle.tar.gz" "$BUNDLE"
tar -C "$work" -xzf "${work}/bundle.tar.gz"
if [[ ! -f "${work}/database.dump" ]]; then
  echo "restore-offsite: bundle is missing database.dump" >&2
  exit 1
fi

if [[ "${RESTORE_SKIP_DOCKER:-}" == "1" ]] || ! command -v docker >/dev/null 2>&1; then
  echo "restore-offsite: decrypted ok (docker not available — skip row-count drill)"
  echo "restore-offsite members: $(tar -tzf "${work}/bundle.tar.gz" | tr '\n' ' ')"
  exit 0
fi

CID="$(docker run -d --rm --network none \
  -e POSTGRES_USER=okauto \
  -e POSTGRES_PASSWORD=okauto \
  -e POSTGRES_DB=okauto \
  "$POSTGRES_IMAGE")"

for _ in $(seq 1 30); do
  if docker exec "$CID" pg_isready -U okauto >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$CID" pg_isready -U okauto >/dev/null 2>&1; then
  echo "restore-offsite failed: throwaway postgres never became ready" >&2
  exit 1
fi

set +e
docker exec -i "$CID" pg_restore -U okauto -d okauto --no-owner --no-acl <"${work}/database.dump"
restore_rc=$?
set -e
if [[ "$restore_rc" -gt 1 ]]; then
  echo "pg_restore failed (exit ${restore_rc})" >&2
  exit 1
fi

counts="$(docker exec "$CID" psql -U okauto -d okauto -v ON_ERROR_STOP=1 -At -F ' ' <<'SQL'
SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'vehicles', COUNT(*) FROM vehicles;
SQL
)"
echo "$counts"

orgs="$(echo "$counts" | awk '$1=="organizations"{print $2}')"
users="$(echo "$counts" | awk '$1=="users"{print $2}')"
vehicles="$(echo "$counts" | awk '$1=="vehicles"{print $2}')"
if [[ "${orgs:-0}" -lt "$MIN_ORGS" || "${users:-0}" -lt "$MIN_USERS" || "${vehicles:-0}" -lt "$MIN_VEHICLES" ]]; then
  echo "restore-offsite failed: row counts too low (orgs=${orgs} users=${users} vehicles=${vehicles})" >&2
  exit 1
fi

echo "restore-offsite ok"
