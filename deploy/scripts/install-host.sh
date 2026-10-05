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

id deploy >/dev/null 2>&1 || useradd --system --home /home/deploy --shell /usr/sbin/nologin --create-home deploy

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
  1. Fill /opt/okauto/.env (chmod 600).
  2. Connect Traefik to the okauto network:
       docker network connect okauto <traefik-container>
  3. Install the GitHub deploy public key in /home/deploy/.ssh/authorized_keys with:
       command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... suivia-github-deploy
     chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy
  4. Confirm `ssh deploy@VPS bash` is refused and `ssh deploy@VPS "deploy <sha>"` is accepted.
EOF
