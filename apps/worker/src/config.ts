import path from "node:path";

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
export const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/Documents/Obsidian/F-HQ";
export const MISSION_CONTROL_STATE_DIR =
  process.env.MISSION_CONTROL_STATE_DIR ?? path.join(OPENCLAW_HOME, "mission-control-state");

export const SNAPSHOT_PATH = path.join(MISSION_CONTROL_STATE_DIR, "snapshots", "current.json");

