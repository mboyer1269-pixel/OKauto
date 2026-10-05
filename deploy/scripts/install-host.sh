#!/usr/bin/env bash
# One-time VPS bootstrap. Run as root after a Hostinger snapshot.
# Does not generate keys or write secrets.
set -euo pipefail

ROOT="${OKAUTO_ROOT:-/opt/okauto}"
REPO_DEPLOY_DIR="${1:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

if [[ -z "$REPO_DEPLOY_DIR" ]]; then
  echo "usage: install-host.sh /path/to/cloned/repo/deploy" >&2
  exit 1
fi

# OpenSSH runs ForcedCommand via the user shell. nologin would reject
# `ssh deploy@host "deploy <sha>"` before deploy-gate.sh. Restriction is
# authorized_keys command= + sudoers, not the login shell.
if ! id deploy >/dev/null 2>&1; then
  useradd --system --home /home/deploy --shell /bin/bash --create-home deploy
else
  usermod -s /bin/bash deploy
fi

if id -nG deploy | grep -qw docker; then
  echo "WARNING: user deploy is in group docker — remove it (gpasswd -d deploy docker)" >&2
fi

mkdir -p "$ROOT/scripts" "$ROOT/backups" /home/deploy/.ssh
chmod 750 "$ROOT"
chmod 700 /home/deploy/.ssh

cp -a "${REPO_DEPLOY_DIR}/compose.prod.yml" "${ROOT}/compose.prod.yml"
cp -a "${REPO_DEPLOY_DIR}/scripts/." "${ROOT}/scripts/"
chmod 755 "${ROOT}/scripts/"*.sh

if [[ ! -f "${ROOT}/.env" ]]; then
  cp "${REPO_DEPLOY_DIR}/.env.prod.example" "${ROOT}/.env"
  chmod 600 "${ROOT}/.env"
  echo "created ${ROOT}/.env from example — fill in real values before the first deploy"
fi

install -m 440 "${REPO_DEPLOY_DIR}/sudoers.deploy" /etc/sudoers.d/okauto-deploy
visudo -cf /etc/sudoers.d/okauto-deploy

docker network inspect okauto >/dev/null 2>&1 || docker network create okauto

cat <<'EOF'
Next steps (manual):
  1. Fill /opt/okauto/.env (chmod 600). DATABASE_URL must use host `postgres`
     (compose DNS), not 127.0.0.1:5433 (that bind is for host-side admin only).
  2. Do NOT run `docker network connect okauto <traefik>`. Traefik already
     uses network_mode: host and Docker will refuse to attach it to a bridge.
     Host-network Traefik reaches the web container via its IP on the okauto
     bridge (labels traefik.docker.network=okauto). Web publishes no host port.
  3. GHCR packages stay PRIVATE. As root, once, with a read-only PAT
     (scope read:packages only):
       echo '<PAT>' | docker login ghcr.io -u <github-username> --password-stdin
       chmod 600 /root/.docker/config.json
     deploy.sh runs as root via sudo, so this login is enough. Do not put the
     PAT in /opt/okauto/.env and do not chmod the docker config world-readable.
  4. Install the GitHub deploy public key in /home/deploy/.ssh/authorized_keys with:
       command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... suivia-github-deploy
     chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy
  5. Confirm `ssh deploy@VPS bash` is refused (ForcedCommand) and
     `ssh deploy@VPS "deploy <sha>"` is accepted.
  6. Point /etc/cron.d/okauto-backup at OKAUTO_ROOT=/opt/okauto and
     /opt/okauto/scripts/backup.sh (compose.prod.yml). See deploy/RUNBOOK.md.
EOF
