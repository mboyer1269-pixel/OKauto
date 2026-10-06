#!/usr/bin/env bash
# Encrypt the latest local dump + env files with age and upload to R2.
# The age private key never touches the VPS (recipient / public key only).
#
# Config: /opt/okauto/backup.env (root-only). Off by default when R2 is unset.
# Retention is an R2 lifecycle rule — this script never lists or deletes.
# BACKUP_KEEP_ENCRYPTED_LOCAL=1 writes the .tar.age next to the dump (tests).
set -euo pipefail

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
BACKUP_ENV_FILE="${ROOT}/backup.env"
BACKUP_DIR="${ROOT}/backups"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R2_PY="${SCRIPT_DIR}/r2.py"

# shellcheck disable=SC1090
set -a
if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  source "$BACKUP_ENV_FILE"
fi
set +a

r2_ready() {
  [[ -n "${BACKUP_R2_ENDPOINT:-}" ]] \
    && [[ -n "${BACKUP_R2_BUCKET:-}" ]] \
    && [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]] \
    && [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" ]]
}

r2_retention_days() {
  local raw="${BACKUP_R2_RETENTION_DAYS:-30}"
  if [[ ! "$raw" =~ ^[0-9]+$ ]] || [[ "$raw" -lt 7 ]]; then
    echo "BACKUP_R2_RETENTION_DAYS=${raw} is invalid (min 7); documenting 30" >&2
    echo 30
    return
  fi
  echo "$raw"
}

dump="${1:-}"
if [[ -z "$dump" ]]; then
  dump="$(ls -1t "${BACKUP_DIR}"/suivia-*.dump 2>/dev/null | head -1 || true)"
fi

if ! r2_ready && [[ "${BACKUP_KEEP_ENCRYPTED_LOCAL:-}" != "1" ]]; then
  echo "offsite backup skipped: R2 not configured"
  exit 0
fi

if [[ -z "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  if r2_ready; then
    echo "offsite backup skipped: BACKUP_AGE_RECIPIENT unset (refusing to upload plaintext)" >&2
    exit 1
  fi
  echo "offsite backup skipped: BACKUP_AGE_RECIPIENT unset"
  exit 0
fi

if [[ -z "$dump" || ! -f "$dump" ]]; then
  echo "offsite backup: no dump found in ${BACKUP_DIR}" >&2
  exit 1
fi

if ! command -v age >/dev/null 2>&1; then
  echo "offsite backup failed: age is not installed (apt-get install -y age)" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "offsite backup failed: python3 is required for the R2 client" >&2
  exit 1
fi

stamp="$(basename "$dump" .dump)"
prefix="${BACKUP_R2_PREFIX:-suivia}"
prefix="${prefix%/}"
work="$(mktemp -d "${TMPDIR:-/tmp}/okauto-offsite.XXXXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

cp -a "$dump" "${work}/database.dump"
if [[ -f "$ENV_FILE" ]]; then
  cp -a "$ENV_FILE" "${work}/env"
else
  printf '# missing\n' >"${work}/env"
fi
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  cp -a "$BACKUP_ENV_FILE" "${work}/backup.env"
else
  printf '# missing\n' >"${work}/backup.env"
fi
printf '%s\n' "$stamp" >"${work}/stamp"

# Stream tar into age so the unencrypted bundle never hits disk.
tar -C "$work" -czf - database.dump env backup.env stamp \
  | age -r "${BACKUP_AGE_RECIPIENT}" -o "${work}/bundle.tar.gz.age"

size="$(wc -c <"${work}/bundle.tar.gz.age")"
sha="$(sha256sum "${work}/bundle.tar.gz.age" | awk '{print $1}')"
echo "offsite bundle ${stamp} (${size} bytes sha256=${sha})"
echo "R2 retention is a bucket lifecycle rule (VPS token is write-only); expected days=$(r2_retention_days)"

if [[ "${BACKUP_KEEP_ENCRYPTED_LOCAL:-}" == "1" ]]; then
  mkdir -p "$BACKUP_DIR"
  cp -a "${work}/bundle.tar.gz.age" "${BACKUP_DIR}/${stamp}.tar.gz.age"
  printf '%s\n' "$sha" >"${BACKUP_DIR}/${stamp}.tar.gz.age.sha256"
  echo "offsite local copy ${BACKUP_DIR}/${stamp}.tar.gz.age"
fi

if ! r2_ready; then
  echo "offsite upload skipped: R2 not configured"
  exit 0
fi

remote_key="${prefix}/${stamp}.tar.gz.age"
python3 "$R2_PY" put "$remote_key" "${work}/bundle.tar.gz.age"
python3 "$R2_PY" head "$remote_key" --expect-sha256 "$sha" --expect-size "$size"

echo "offsite backup ok key=${remote_key} bytes=${size} sha256=${sha}"
