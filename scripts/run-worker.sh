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

exec pnpm run:worker
