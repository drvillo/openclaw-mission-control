#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="ai.drvillo.openclaw-mission-control.worker"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

stopped=0

if [[ -f "$PLIST" ]]; then
  if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
    launchctl bootout "gui/$UID" "$PLIST" >/dev/null 2>&1 || true
    echo "Stopped launchd agent $LABEL"
    stopped=1
  fi
fi

worker_pids="$(
  {
    pgrep -f "$ROOT/scripts/run-worker.sh" 2>/dev/null || true
    pgrep -f "$ROOT/apps/worker/src/index.ts" 2>/dev/null || true
    pgrep -f "@ocmc/worker" 2>/dev/null || true
  } | sort -u
)"

if [[ -n "$worker_pids" ]]; then
  echo "$worker_pids" | xargs kill
  echo "Stopped Mission Control worker process"
  stopped=1
fi

if [[ "$stopped" -eq 0 ]]; then
  echo "Mission Control worker is not running"
fi
