#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3099}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
LABEL="ai.drvillo.openclaw-mission-control.web"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

stopped=0

if [[ -f "$PLIST" ]]; then
  if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
    launchctl bootout "gui/$UID" "$PLIST" >/dev/null 2>&1 || true
    echo "Stopped launchd agent $LABEL"
    stopped=1
  fi
fi

port_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$port_pids" ]]; then
  echo "$port_pids" | xargs kill
  echo "Stopped Mission Control web on http://$HOSTNAME:$PORT"
  stopped=1
fi

if [[ "$stopped" -eq 0 ]]; then
  echo "Mission Control web is not running"
fi
