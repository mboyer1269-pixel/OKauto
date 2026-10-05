#!/usr/bin/env bash
# Forced SSH command for the `deploy` user.
# authorized_keys must contain:
#   command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 ...
set -euo pipefail

cmd="${SSH_ORIGINAL_COMMAND:-}"
if [[ "$cmd" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec sudo /opt/okauto/scripts/deploy.sh "${BASH_REMATCH[1]}"
fi

echo "refused: expected 'deploy <40-char-sha>'" >&2
exit 1
