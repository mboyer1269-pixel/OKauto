#!/usr/bin/env bash
# Deploy an already-published GHCR image pair tagged with a git SHA.
# Steps: lock → dump → tag previous → rehearsal migrate → pull → migrate → up → health → record.
# On failure, re-pull the previous SHA from GHCR and bring web/worker back.
set -euo pipefail

SHA="${1:?usage: deploy.sh <40-char-lowercase-sha>}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid sha: ${SHA}" >&2
  exit 1
fi

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
ENV_FILE="${ROOT}/.env"
COMPOSE_FILE="${ROOT}/compose.prod.yml"
STATE_FILE="${ROOT}/.deployed"
LOCK_FILE="${ROOT}/.deploy.lock"
BACKUP_DIR="${ROOT}/backups"
WEB_IMAGE="${WEB_IMAGE:-ghcr.io/mboyer1269-pixel/okauto-web}"
WORKER_IMAGE="${WORKER_IMAGE:-ghcr.io/mboyer1269-pixel/okauto-worker}"
HEALTH_URL="${HEALTH_URL:-https://suivia.ca/api/health}"
READY_URL="${READY_URL:-https://suivia.ca/api/health/ready}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY_SEC="${HEALTH_DELAY_SEC:-4}"

cd "$ROOT"
mkdir -p "$BACKUP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "another deploy is in progress" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

export APP_VERSION="$SHA"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

previous_sha=""
if [[ -f "$STATE_FILE" ]]; then
  previous_sha="$(tr -d '[:space:]' <"$STATE_FILE")"
fi

json_version_ok() {
  local expected="$1"
  python3 -c 'import json,sys
expected=sys.argv[1]
data=json.load(sys.stdin)
raise SystemExit(0 if data.get("status")=="ok" and data.get("version")==expected else 1)' "$expected"
}

wait_for_health() {
  local expected="$1"
  local i body
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null)" \
      && printf '%s' "$body" | json_version_ok "$expected"; then
      echo "health ok version=${expected}"
      return 0
    fi
    echo "waiting for health version=${expected} (${i}/${HEALTH_RETRIES})"
    sleep "$HEALTH_DELAY_SEC"
  done
  echo "health check failed for ${expected}" >&2
  return 1
}

protect_previous_from_prune() {
  local sha="$1"
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    return 0
  fi
  docker pull "${WEB_IMAGE}:${sha}"
  docker pull "${WORKER_IMAGE}:${sha}"
  docker tag "${WEB_IMAGE}:${sha}" "${WEB_IMAGE}:previous"
  docker tag "${WORKER_IMAGE}:${sha}" "${WORKER_IMAGE}:previous"
  docker tag "${WEB_IMAGE}:${sha}" "${WEB_IMAGE}:${sha}"
  docker tag "${WORKER_IMAGE}:${sha}" "${WORKER_IMAGE}:${sha}"
}

rollback() {
  if [[ ! "$previous_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "no previous SHA recorded; cannot rollback automatically" >&2
    return 1
  fi
  echo "rolling back to ${previous_sha}" >&2
  export APP_VERSION="$previous_sha"
  protect_previous_from_prune "$previous_sha"
  compose up -d --no-deps --wait web worker || compose up -d --no-deps web worker
  wait_for_health "$previous_sha" || true
}

rehearsal_url() {
  python3 - <<'PY'
import os
from urllib.parse import urlparse, urlunparse
parts = urlparse(os.environ["DATABASE_URL"])
print(urlunparse((parts.scheme, parts.netloc, "/okauto_rehearsal", "", parts.query, "")))
PY
}

rehearse_migrate() {
  echo "migration rehearsal on okauto_rehearsal"
  local dump
  dump="$(ls -1t "${BACKUP_DIR}"/suivia-*.dump 2>/dev/null | head -1 || true)"
  if [[ -z "$dump" ]]; then
    echo "no dump available for rehearsal" >&2
    return 1
  fi

  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS okauto_rehearsal WITH (FORCE);" \
    -c "CREATE DATABASE okauto_rehearsal OWNER ${POSTGRES_USER};"

  set +e
  compose exec -T postgres pg_restore -U "${POSTGRES_USER}" -d okauto_rehearsal --no-owner --no-acl <"$dump"
  local rc=$?
  set -e
  if [[ "$rc" -gt 1 ]]; then
    echo "rehearsal restore failed" >&2
    compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS okauto_rehearsal WITH (FORCE);" || true
    return 1
  fi

  local url
  url="$(rehearsal_url)"
  if ! docker run --rm --network okauto \
    -e DATABASE_URL="$url" \
    "${WEB_IMAGE}:${SHA}" \
    sh -c 'cd /app/packages/database && npx prisma migrate deploy'; then
    echo "rehearsal migrate failed — aborting before touching production" >&2
    compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS okauto_rehearsal WITH (FORCE);" || true
    return 1
  fi

  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS okauto_rehearsal WITH (FORCE);"
  echo "migration rehearsal ok"
}

trap 'echo "deploy failed for ${SHA}" >&2; rollback || true' ERR

echo "deploy ${SHA} (previous=${previous_sha:-none})"

"${ROOT}/scripts/backup.sh" --label "pre-deploy-${SHA:0:12}"

if [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]]; then
  protect_previous_from_prune "$previous_sha"
fi

docker pull "${WEB_IMAGE}:${SHA}"
docker pull "${WORKER_IMAGE}:${SHA}"

rehearse_migrate

compose pull web worker migrate
compose run --rm migrate
compose up -d --no-deps --wait web worker || compose up -d --no-deps web worker

wait_for_health "$SHA"

if ! curl -fsS --max-time 10 "$READY_URL" >/dev/null; then
  echo "warning: ${READY_URL} is not ready yet (worker heartbeat may still be starting)" >&2
fi

printf '%s\n' "$SHA" >"$STATE_FILE"
docker tag "${WEB_IMAGE}:${SHA}" "${WEB_IMAGE}:current"
docker tag "${WORKER_IMAGE}:${SHA}" "${WORKER_IMAGE}:current"

trap - ERR
echo "deployed ${SHA}"
