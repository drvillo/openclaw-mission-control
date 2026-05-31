import path from "node:path";

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
export const OPENCLAW_BIN = process.env.OPENCLAW_BIN ?? "/Users/fonkey-oc/.nvm/versions/node/v22.22.1/bin/openclaw";
export const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/obsidian-fhq-data";
export const MISSION_CONTROL_STATE_DIR =
  process.env.MISSION_CONTROL_STATE_DIR ?? path.join(OPENCLAW_HOME, "mission-control-state");

export const SNAPSHOT_PATH = path.join(MISSION_CONTROL_STATE_DIR, "snapshots", "current.json");
export const DATABASE_PATH = path.join(MISSION_CONTROL_STATE_DIR, "mission-control.sqlite");
export const TASKS_ROOT = path.join(OBSIDIAN_VAULT, "Tasks");
export const TASK_BOARD_WRAPPER = path.join(OPENCLAW_HOME, "workspace-task-ops-agent", "scripts", "task_board.py");
