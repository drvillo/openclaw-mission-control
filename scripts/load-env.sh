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
# openclaw/pnpm/node, so pin paths instead of relying on a shell profile.
# Mission Control's current web build uses Node 22. The OpenClaw wrapper
# independently selects its own pinned Node 26 runtime.
export PATH="/Users/fonkey-oc/.openclaw/bin:/Users/fonkey-oc/.nvm/versions/node/v22.22.1/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
