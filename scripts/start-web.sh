#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export OPENCLAW_HOME="${OPENCLAW_HOME:-/Users/fonkey-oc/.openclaw}"
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-/Users/fonkey-oc/Documents/Obsidian/F-HQ}"
export MISSION_CONTROL_STATE_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}"
PORT="${PORT:-3099}"
HOSTNAME="${HOSTNAME:-127.0.0.1}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -q "$HOSTNAME:$PORT"; then
  echo "Mission Control is already running at http://$HOSTNAME:$PORT" >&2
  exit 0
fi

exec pnpm start:web
