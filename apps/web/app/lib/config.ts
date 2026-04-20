import path from "node:path";

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
export const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/Documents/Obsidian/F-HQ";
export const MISSION_CONTROL_STATE_DIR =
  process.env.MISSION_CONTROL_STATE_DIR ?? path.join(OPENCLAW_HOME, "mission-control-state");
export const MISSION_CONTROL_DB_PATH = path.join(MISSION_CONTROL_STATE_DIR, "mission-control.sqlite");
export const SNAPSHOT_PATH = path.join(MISSION_CONTROL_STATE_DIR, "snapshots", "current.json");
export const TASKS_ROOT = path.join(OBSIDIAN_VAULT, "Tasks");
export const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
export const FATHOM_SYNC_SCRIPT = path.join(
  OPENCLAW_HOME,
  "workspace-meeting-assistant",
  "skills",
  "fathom-action-sync",
  "scripts",
  "fathom_task_sync.py",
);
export const TASK_BOARD_WRAPPER = path.join(OPENCLAW_HOME, "workspace-task-ops-agent", "scripts", "task_board.py");
