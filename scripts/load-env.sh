#!/bin/zsh

if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

ENV_FILE="$ROOT/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# launchd starts jobs with a very small PATH. Mission Control shells out to
# openclaw/pnpm/node, so pin the local toolchain paths here instead of relying
# on an interactive shell profile.
export PATH="/Users/fonkey-oc/.openclaw/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
