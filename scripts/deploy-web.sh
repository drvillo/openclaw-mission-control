#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/load-env.sh"

LABEL="${LABEL:-ai.drvillo.openclaw-mission-control.web}"
PORT="${PORT:-3099}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
VERIFY_URL="${VERIFY_URL:-http://127.0.0.1:$PORT}"
WAIT_SECONDS="${WAIT_SECONDS:-25}"
PLIST_SOURCE="$ROOT/ops/launchd/${LABEL}.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${MISSION_CONTROL_STATE_DIR:-/Users/fonkey-oc/.openclaw/mission-control-state}/logs"

if [[ ! -f "$PLIST_SOURCE" ]]; then
  echo "Missing LaunchAgent template: $PLIST_SOURCE" >&2
  exit 1
fi

echo "Building web app..."
pnpm --filter @ocmc/web build

echo "Installing LaunchAgent plist..."
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cp "$PLIST_SOURCE" "$PLIST_TARGET"

echo "Stopping existing launchd service if loaded..."
launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID" "$PLIST_TARGET" >/dev/null 2>&1 || true

echo "Clearing stale listeners on port $PORT..."
port_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$port_pids" ]]; then
  echo "$port_pids" | xargs kill >/dev/null 2>&1 || true
  sleep 1
fi

port_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$port_pids" ]]; then
  echo "$port_pids" | xargs kill -9 >/dev/null 2>&1 || true
  sleep 1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is still occupied; refusing to start launchd service." >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
  exit 1
fi

echo "Starting launchd service..."
launchctl bootstrap "gui/$UID" "$PLIST_TARGET"
launchctl kickstart -k "gui/$UID/$LABEL"

echo "Waiting for $VERIFY_URL..."
deadline=$((SECONDS + WAIT_SECONDS))
until curl -fsS -I "$VERIFY_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for $VERIFY_URL" >&2
    launchctl print "gui/$UID/$LABEL" >&2 || true
    exit 1
  fi
  sleep 1
done

html="$(curl -fsS "$VERIFY_URL")"
assets=("${(@f)$(printf "%s" "$html" | grep -Eo '/_next/static/chunks/[^" ]+' | sed 's/\\$//' | sort -u)}")

if (( ${#assets[@]} == 0 )); then
  echo "No Next static chunks found in served HTML; deploy verification failed." >&2
  exit 1
fi

echo "Verifying served static chunks..."
for asset in "${assets[@]}"; do
  http_status="$(curl -sS -o /dev/null -w "%{http_code}" "$VERIFY_URL$asset")"
  if [[ "$http_status" != "200" ]]; then
    echo "Asset verification failed: $asset returned HTTP $http_status" >&2
    exit 1
  fi
done

echo "Deployed $LABEL on $VERIFY_URL"
launchctl print "gui/$UID/$LABEL" | sed -n '1,45p'
