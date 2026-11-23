#!/usr/bin/env bash
# A workflow may send its short-lived GITHUB_TOKEN as one stdin line. Keep the
# credential out of command arguments, persistent Docker config, and logs.
suivia_registry_config=""

cleanup_registry_auth() {
  if [[ "$suivia_registry_config" == /tmp/suivia-ghcr.* && -d "$suivia_registry_config" ]]; then
    rm -rf -- "$suivia_registry_config"
  fi
}

prepare_registry_auth() {
  local registry_token=""
  # Manual deployments without stdin retain the host's existing Docker login.
  if [[ -t 0 ]] || ! IFS= read -r -t 2 registry_token || [[ -z "$registry_token" ]]; then
    return 0
  fi
  suivia_registry_config="$(mktemp -d /tmp/suivia-ghcr.XXXXXXXX)"
  chmod 700 "$suivia_registry_config"
  export DOCKER_CONFIG="$suivia_registry_config"
  trap cleanup_registry_auth EXIT
  if ! printf '%s\n' "$registry_token" | docker login ghcr.io \
    --username mboyer1269-pixel --password-stdin >/dev/null 2>&1; then
    unset registry_token
    echo "GHCR authentication failed; no deployment started" >&2
    return 1
  fi
  unset registry_token
  echo "GHCR authenticated with an ephemeral deployment credential"
}
