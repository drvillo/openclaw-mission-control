#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export OPENCLAW_HOME="${OPENCLAW_HOME:-/Users/fonkey-oc/.openclaw}"
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-/Users/fonkey-oc/Documents/Obsidian/F-HQ}"
export MISSION_CONTROL_STATE_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}"

exec pnpm run:worker
