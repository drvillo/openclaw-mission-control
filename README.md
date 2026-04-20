# OpenClaw Mission Control

Mission Control is the operational UI and worker for this OpenClaw installation.

## Staging Location

This checkout is staged at:

`/Users/fonkey-oc/.openclaw/openclaw-mission-control`

The intended final repo location is:

`/Users/fonkey-oc/Code/drvillo/openclaw-mission-control`

The sandbox for this session does not permit writing to `/Users/fonkey-oc/Code`, so implementation is staged here and can be moved later without code changes.

## Runtime Defaults

- `OPENCLAW_HOME=/Users/fonkey-oc/.openclaw`
- `OBSIDIAN_VAULT=/Users/fonkey-oc/Documents/Obsidian/F-HQ`
- `MISSION_CONTROL_STATE_DIR=/Users/fonkey-oc/.openclaw/mission-control-state`

## Packages

- `apps/web`: Next.js admin UI
- `apps/worker`: snapshot/ingest worker
- `packages/shared`: route + event contracts
- `packages/db`: SQLite/Drizzle schema

## Current Scope

- reads webhook event logs produced by the OpenClaw scripts
- reads Obsidian task files for high-level counts
- reads OpenClaw `tasks`, `tasks flow`, and `tasks audit` output via the worker
- exposes a first dashboard for task state, flow state, and webhook ingress visibility

## CI

The repo includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:

- installs dependencies with `pnpm`
- runs `pnpm typecheck`
- runs `pnpm build`

This is the right initial CI surface for Mission Control because the highest-probability regressions here are TypeScript contract drift and build breakage.

## macOS Startup

Launchd templates live in `ops/launchd/`:

- `ai.drvillo.openclaw-mission-control.web.plist`
- `ai.drvillo.openclaw-mission-control.worker.plist`

Recommended install flow on macOS:

Replace `/Users/fonkey-oc/.openclaw/openclaw-mission-control` with your final checkout path if you move the repo.

```bash
mkdir -p ~/.openclaw/mission-control-state/logs
cp /Users/fonkey-oc/.openclaw/openclaw-mission-control/ops/launchd/*.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$UID" ~/Library/LaunchAgents/ai.drvillo.openclaw-mission-control.web.plist
launchctl bootstrap "gui/$UID" ~/Library/LaunchAgents/ai.drvillo.openclaw-mission-control.worker.plist
launchctl kickstart -k "gui/$UID/ai.drvillo.openclaw-mission-control.web"
launchctl kickstart -k "gui/$UID/ai.drvillo.openclaw-mission-control.worker"
```

The web service runs continuously on `127.0.0.1:3099`. The worker runs every 120 seconds and refreshes the snapshot and event-derived state.
