#!/usr/bin/env bash
# Atomically set APP_VERSION=<sha> in an env file. All other bytes are kept.
# Usage: persist-app-version.sh <env-file> <40-char-sha>
set -euo pipefail

ENV_FILE="${1:?usage: persist-app-version.sh <env-file> <sha>}"
SHA="${2:?usage: persist-app-version.sh <env-file> <sha>}"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid sha: ${SHA}" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file missing: ${ENV_FILE}" >&2
  exit 1
fi

python3 - "$ENV_FILE" "$SHA" <<'PY'
import os
import sys

path, sha = sys.argv[1], sys.argv[2]
data = open(path, "rb").read()
newline = b"\r\n" if b"\r\n" in data else b"\n"
lines = data.splitlines(keepends=True)
out = []
found = False
replacement = f"APP_VERSION={sha}".encode()
for line in lines:
    raw = line.rstrip(b"\r\n")
    ending = line[len(raw) :]
    if raw.startswith(b"APP_VERSION="):
        out.append(replacement + (ending or newline))
        found = True
    else:
        out.append(line)
if not found:
    if out and not out[-1].endswith((b"\n", b"\r")):
        out[-1] += newline
    out.append(replacement + newline)

tmp = f"{path}.tmp.{os.getpid()}"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
try:
    os.write(fd, b"".join(out))
finally:
    os.close(fd)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
