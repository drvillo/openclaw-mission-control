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

