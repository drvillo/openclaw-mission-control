#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export OPENCLAW_HOME="${OPENCLAW_HOME:-/Users/fonkey-oc/.openclaw}"
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-/Users/fonkey-oc/Documents/Obsidian/F-HQ}"
export MISSION_CONTROL_STATE_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}"
PORT="${PORT:-3099}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Mission Control is already running on port $PORT" >&2
  exit 0
fi

export PORT
export HOSTNAME

exec pnpm start:web
