#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/load-env.sh"

export OPENCLAW_HOME="${OPENCLAW_HOME:-/Users/fonkey-oc/.openclaw}"
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-/Users/fonkey-oc/obsidian-fhq-data}"
export MISSION_CONTROL_STATE_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}"
export TASK_BOARD_INBOX="${TASK_BOARD_INBOX:-$OBSIDIAN_VAULT/Tasks/Task Inbox.md}"
export TASK_BOARD_DETAILS_DIR="${TASK_BOARD_DETAILS_DIR:-$OBSIDIAN_VAULT/Tasks/Details}"
export TASK_BOARD_ATTIC_FILE="${TASK_BOARD_ATTIC_FILE:-$OBSIDIAN_VAULT/Tasks/Task Attic.md}"
export TASK_BOARD_TASKS_DIR="${TASK_BOARD_TASKS_DIR:-$OBSIDIAN_VAULT/Tasks}"
PORT="${PORT:-3099}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
SERVER_JS="$ROOT/apps/web/.next/standalone/apps/web/server.js"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Mission Control is already running on port $PORT" >&2
  exit 1
fi

if [[ ! -f "$SERVER_JS" ]]; then
  echo "Mission Control standalone build is missing: $SERVER_JS" >&2
  echo "Run: pnpm --filter @ocmc/web build" >&2
  exit 1
fi

export PORT
export HOSTNAME

exec node "$SERVER_JS"
