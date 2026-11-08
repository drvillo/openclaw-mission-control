import path from "node:path";

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
export const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/obsidian-fhq-data";
export const MISSION_CONTROL_STATE_DIR =
  process.env.MISSION_CONTROL_STATE_DIR ?? path.join(OPENCLAW_HOME, "mission-control-state");
export const MISSION_CONTROL_DB_PATH = path.join(MISSION_CONTROL_STATE_DIR, "mission-control.sqlite");
export const SNAPSHOT_PATH = path.join(MISSION_CONTROL_STATE_DIR, "snapshots", "current.json");
export const TASKS_ROOT = path.join(OBSIDIAN_VAULT, "Tasks");
export const FATHOM_RECORDINGS_ROOT = path.join(OBSIDIAN_VAULT, "Meeting Recordings", "Fathom");
export const MISSION_CONTROL_SEMANTIC_DB_PATH = process.env.MISSION_CONTROL_SEMANTIC_DB_PATH ?? path.join(OPENCLAW_HOME, "semantic", "meetings.sqlite");
export const MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH = process.env.MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH ?? "";
export const MISSION_CONTROL_SEMANTIC_NOTE_ROOTS = (process.env.MISSION_CONTROL_SEMANTIC_NOTE_ROOTS ?? FATHOM_RECORDINGS_ROOT)
  .split(path.delimiter)
  .map((root) => root.trim())
  .filter(Boolean);
export const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
export const FATHOM_SYNC_SCRIPT = path.join(
  OPENCLAW_HOME,
  "workspace-meeting-assistant",
  "skills",
  "fathom-action-sync",
  "scripts",
  "fathom_task_sync.py",
);
export const AGENTMAIL_ROUTER_SCRIPT = path.join(OPENCLAW_HOME, "workspace", "scripts", "agentmail_webhook_router.py");
export const TASK_BOARD_WRAPPER = path.join(OPENCLAW_HOME, "workspace-task-ops-agent", "scripts", "task_board.py");
export const INVOICE_AGENT_WRAPPER = path.join(OPENCLAW_HOME, "workspace-invoice-ops", "scripts", "invoice-agent");
export const MISSION_CONTROL_MEETINGS_SOURCE = process.env.MISSION_CONTROL_MEETINGS_SOURCE ?? "db";
export const MISSION_CONTROL_SEMANTIC_CONCEPTS = process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS === "1" || process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS === "true";
export const MISSION_CONTROL_SEMANTIC_SYNTHESIS_PROVIDER = process.env.MISSION_CONTROL_SEMANTIC_SYNTHESIS_PROVIDER ?? "disabled";
export const MISSION_CONTROL_SEMANTIC_EMBEDDING_PROVIDER = process.env.MISSION_CONTROL_SEMANTIC_EMBEDDING_PROVIDER ?? "disabled";
export const MISSION_CONTROL_SEMANTIC_OPENAI_BASE_URL = process.env.MISSION_CONTROL_SEMANTIC_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "";
export const MISSION_CONTROL_SEMANTIC_OPENAI_API_KEY = process.env.MISSION_CONTROL_SEMANTIC_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
export const MISSION_CONTROL_SEMANTIC_LLM_MODEL = process.env.MISSION_CONTROL_SEMANTIC_LLM_MODEL ?? "gpt-4.1-mini";
export const MISSION_CONTROL_SEMANTIC_EMBEDDING_MODEL = process.env.MISSION_CONTROL_SEMANTIC_EMBEDDING_MODEL ?? "text-embedding-3-small";
