# OpenClaw Mission Control

Mission Control is the operational UI and worker for this OpenClaw installation.

## Staging Location

This checkout is staged at:

`/Users/fonkey-oc/.openclaw/openclaw-mission-control`

The intended final repo location is:

`/Users/fonkey-oc/Code/drvillo/openclaw-mission-control`

The sandbox for this session does not permit writing to `/Users/fonkey-oc/Code`, so implementation is staged here and can be moved later without code changes.

## Local Environment

Use `.env.local` for machine-specific settings. The repo’s `.gitignore` already excludes `.env.local` and other `.env.*` files from git.

## Runtime Defaults

- `OPENCLAW_HOME=/Users/fonkey-oc/.openclaw`
- `OBSIDIAN_VAULT=/Users/fonkey-oc/obsidian-fhq-data`
- `MISSION_CONTROL_STATE_DIR=/Users/fonkey-oc/.openclaw/mission-control-state`

## Packages

- `apps/web`: Next.js admin UI
- `apps/worker`: snapshot/ingest worker
- `packages/shared`: route + event contracts
- `packages/db`: SQLite/Drizzle schema

## Current Scope

- reads webhook event logs produced by the OpenClaw scripts
- reads Obsidian task files for high-level counts
- reads supported Gateway session/cron APIs and the local workflow ledger via the worker
- exposes a first dashboard for task state, flow state, and webhook ingress visibility

## CI

The repo includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:

- installs dependencies with `pnpm install --frozen-lockfile`
- runs `pnpm typecheck`
- runs `pnpm build`

This is the right initial CI surface for Mission Control because the highest-probability regressions here are TypeScript contract drift and build breakage.

The external semantic runtime is pinned as a portable dependency archive; see
[vendor/README.md](vendor/README.md) for provenance and refresh instructions.

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

## Web Production Deploy

After changing the web code, rebuild and rewire the launchd-managed production service with:

```bash
pnpm deploy:web
```

The deploy script builds `@ocmc/web`, installs the LaunchAgent plist, boots out the old service, clears stale listeners on port `3099`, bootstraps/kickstarts launchd, then verifies that every `_next/static/chunks/*` asset referenced by the served HTML returns `200`.

For Tailscale verification, override the URL used for the final checks:

```bash
VERIFY_URL=http://fonkeys-mac-mini:3099 pnpm deploy:web
```

## OpenClaw 2026.11 compatibility

The worker uses `openclaw gateway call` for `sessions.list`, `chat.history`, `cron.list`, and `cron.runs`. This uses the selected state's configured local Gateway and credentials; it does not require the admin HTTP RPC plugin. `OPENCLAW_HOME` remains Mission Control's state-root setting. The worker translates it to `OPENCLAW_STATE_DIR` and an explicit `OPENCLAW_CONFIG_PATH` for CLI subprocesses, and ignores inherited Gateway URL/port overrides. Set `OPENCLAW_BIN` to that installation's launcher. The configured Gateway must be running and authorize operator reads.

Runtime rows represent sessions, using `hasActiveRun` for live activity, without claiming that an accepted spawn completed. Routing policy analysis reads main-agent transcript projections through `chat.history`, not the retired JSONL session layout. It covers sessions active within the last 90 days; Gateway read failures or an exceeded pagination budget preserve the previous source snapshot. Cron jobs include disabled jobs; run history is the latest 200 records across jobs.

Durable application flows come from `MISSION_CONTROL_PYTHON <state>/lib/workflow_ledger.py snapshot --json` (Python defaults to `/Users/fonkey-oc/bin/oc-python`). The read-only CLI contract is `{schemaVersion:1,generatedAt:<ISO>,flows:[...],findings:[...]}`. Flows retain their original IDs, revisions, camelCase display fields, `stateJson` and `waitJson`; timestamps are epoch milliseconds. The snapshot must be complete and must fail nonzero when unavailable. Mission Control observes approval state and never advances a workflow during refresh.

Each source publishes its checked time, last successful time and failure state in `snapshots/current.json`. Omitted failed sources leave their existing derived database tables intact; successful empty results clear only that source's derived tables. Business records, including meetings, assertions, reviews and concepts, are outside this refresh boundary. The Ops page exposes stale sources and ranks refresh failures ahead of a misleading healthy empty view.

Memory health uses the supported online `memory.status` Gateway RPC for each configured agent, with at most four CLI requests at a time. The offline `openclaw memory status` CLI is not used while the Gateway owns its stores. Mission Control preserves the provider’s ready, degraded or unavailable result; a failed RPC retains the last complete source snapshot. QMD, shared-memory symlinks and a daily note are no longer health prerequisites. Existing database column names remain for compatibility. Provider health does not verify embedding efficacy; retrieval tests remain a separate migration acceptance check.

When native health is degraded solely with a pending embedding provider, a valid index identity and either a complete vector index or an empty index with zero files/chunks, Mission Control reports `provider_pending` instead of `index_unhealthy`. Native degraded details remain visible and this state does not claim embedding readiness. Incomplete/invalid indexes and actual provider failures remain unhealthy.
