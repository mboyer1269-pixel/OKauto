#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/persistent"
printf 'unchanged' > "$TEST_DIR/persistent/config.json"
cat > "$TEST_DIR/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == 'login ghcr.io --username mboyer1269-pixel --password-stdin' ]]
IFS= read -r token
[[ "$token" == fixture-ephemeral-token ]]
[[ -d "$DOCKER_CONFIG" ]]
printf '%s' "$DOCKER_CONFIG" > "$TEST_DIR/credential-path"
printf 'mock credential' > "$DOCKER_CONFIG/config.json"
exit "${MOCK_LOGIN_EXIT:-0}"
MOCK
chmod +x "$TEST_DIR/bin/docker"
export PATH="$TEST_DIR/bin:$PATH" TEST_DIR SCRIPT_DIR

for login_exit in 0 1; do
  set +e
  output="$(printf '%s\n' fixture-ephemeral-token | MOCK_LOGIN_EXIT="$login_exit" bash -c '
    set -euo pipefail
    source "$SCRIPT_DIR/registry-auth.sh"
    prepare_registry_auth
    [[ -f "$DOCKER_CONFIG/config.json" ]]
  ' 2>&1)"
  actual_exit=$?
  set -e
  [[ "$actual_exit" -eq "$login_exit" ]]
  [[ "$output" != *fixture-ephemeral-token* ]]
  [[ ! -d "$(cat "$TEST_DIR/credential-path")" ]]
  [[ "$(cat "$TEST_DIR/persistent/config.json")" == unchanged ]]
done

DOCKER_CONFIG="$TEST_DIR/persistent" bash -c '
  set -euo pipefail
  source "$SCRIPT_DIR/registry-auth.sh"
  prepare_registry_auth </dev/null
  [[ "$DOCKER_CONFIG" == "$TEST_DIR/persistent" ]]
  [[ -z "$suivia_registry_config" ]]
'
echo 'registry authentication: success, failure cleanup, no secret logs, manual fallback OK'
