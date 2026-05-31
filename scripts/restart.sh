#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$ROOT/scripts"
source "$SCRIPTS_DIR/load-env.sh"
STATE_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}"
LOG_DIR="$STATE_DIR/logs"

WEB_LABEL="ai.drvillo.openclaw-mission-control.web"
WORKER_LABEL="ai.drvillo.openclaw-mission-control.worker"
WEB_PLIST="$HOME/Library/LaunchAgents/${WEB_LABEL}.plist"
WORKER_PLIST="$HOME/Library/LaunchAgents/${WORKER_LABEL}.plist"

"$SCRIPTS_DIR/stop-web.sh"
"$SCRIPTS_DIR/stop-worker.sh"

if [[ -f "$WEB_PLIST" ]]; then
  launchctl bootstrap "gui/$UID" "$WEB_PLIST"
  launchctl kickstart -k "gui/$UID/$WEB_LABEL"
  echo "Restarted launchd agent $WEB_LABEL"
else
  mkdir -p "$LOG_DIR"
  "$SCRIPTS_DIR/start-web.sh" >>"$LOG_DIR/web.stdout.log" 2>>"$LOG_DIR/web.stderr.log" &
  disown
  echo "Restarted Mission Control web via start-web.sh"
  echo "Logs: $LOG_DIR/web.stdout.log and $LOG_DIR/web.stderr.log"
fi

if [[ -f "$WORKER_PLIST" ]]; then
  launchctl bootstrap "gui/$UID" "$WORKER_PLIST"
  launchctl kickstart -k "gui/$UID/$WORKER_LABEL"
  echo "Restarted launchd agent $WORKER_LABEL"
else
  echo "Skipped worker restart: $WORKER_PLIST is not installed"
fi
