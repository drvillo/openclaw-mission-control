import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { refreshMissionControlState } from "../../../worker/src/refresh";
import { AGENTMAIL_ROUTER_SCRIPT, FATHOM_SYNC_SCRIPT, INVOICE_AGENT_WRAPPER, OPENCLAW_HOME, TASK_BOARD_WRAPPER } from "./config";

const execFileAsync = promisify(execFile);
const OC_PYTHON = "/Users/fonkey-oc/bin/oc-python";
const MEMORY_MAINTENANCE_SCRIPT = `${OPENCLAW_HOME}/workspace/scripts/memory_maintenance.py`;

type FlowAction = "approve" | "delete";

const FLOW_CONTROLLER_COMMANDS: Record<
  string,
  Partial<Record<FlowAction, (lookup: string) => Promise<{ stdout: string; stderr: string }>>>
> = {
  "invoice/monthly-client-invoice": {
    approve: (lookup) => runCommand(INVOICE_AGENT_WRAPPER, ["flow", "approve", lookup], OPENCLAW_HOME),
    delete: (lookup) => runCommand(INVOICE_AGENT_WRAPPER, ["flow", "delete", lookup], OPENCLAW_HOME),
  },
};

function parseJsonPayload(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;
  return start >= 0 ? JSON.parse(trimmed.slice(start)) : { stdout: trimmed };
}

function buildChildEnv() {
  const childEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete childEnv.OPENCLAW_HOME;
  const nodeBinDir = path.dirname(process.execPath);
  childEnv.PATH = childEnv.PATH ? `${nodeBinDir}:${childEnv.PATH}` : nodeBinDir;
  return childEnv;
}

async function runCommand(command: string, args: string[], cwd: string) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
    env: buildChildEnv(),
  });
  return { stdout, stderr };
}

async function runCommandWithStdin(command: string, args: string[], cwd: string, stdin: string) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildChildEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `Command failed with exit code ${code}`));
    });
    child.stdin.end(stdin);
  });
}

export type ObsidianBoardTask = {
  title: string;
  checked: boolean;
  line: number;
  id: string;
  status: string;
  owner: string;
  assignee_type: string;
  assignee: string;
  agent_status: string;
  created_on: string;
  remind_on: string;
  run_id: string;
  flow_id: string;
  details_ref: string;
  results_ref: string;
  log_ref: string;
  detail_path: string | null;
  detail_exists: boolean;
  detail_sections: {
    request: string;
    acceptance_criteria: string;
    execution_log: string;
    results: string;
  };
  detail_triage: {
    owner: string | null;
    next_action: string | null;
    blocked_on: string | null;
    decision_by: string | null;
  };
  detail_body: string | null;
  lint_errors: Array<{ code: string; message: string; line: number }>;
  lint_warnings: Array<{ code: string; message: string; line: number }>;
};

export type ObsidianBoardPayload = {
  generated_at: string;
  file: string;
  details_dir: string;
  tasks: ObsidianBoardTask[];
  columns: Array<{ id: string; count: number }>;
  lint: {
    ok: boolean;
    file: string;
    task_count: number;
    errors: Array<{ id: string; line: number; code: string; message: string }>;
    warnings: Array<{ id: string; line: number; code: string; message: string }>;
  };
};

export async function refreshDerivedState() {
  return {
    summary: "Worker refresh completed",
    payload: await refreshMissionControlState(),
  };
}

export async function runMemoryDoctor() {
  const maintenance = await runCommandWithStdin(
    OC_PYTHON,
    [MEMORY_MAINTENANCE_SCRIPT, "ensure-daily", "--workspace", "all", "--date", "today", "--json"],
    OPENCLAW_HOME,
    "",
  );
  const snapshot = await refreshMissionControlState();
  return {
    summary: "Memory doctor completed",
    payload: {
      maintenance: parseJsonPayload(maintenance.stdout || maintenance.stderr),
      snapshot,
    },
  };
}

export async function previewReconciliation() {
  const active = await runCommand(OC_PYTHON, [TASK_BOARD_WRAPPER, "list-agent-active"], OPENCLAW_HOME);
  const payload = JSON.parse(active.stdout.trim() || "{}");
  const reconcile = await runCommandWithStdin(
    OC_PYTHON,
    [TASK_BOARD_WRAPPER, "reconcile-agent-task", "--stdin-json", "--dry-run"],
    OPENCLAW_HOME,
    JSON.stringify(payload),
  );
  return {
    summary: "Reconciliation preview completed",
    payload: parseJsonPayload(reconcile.stdout || reconcile.stderr),
  };
}

export async function previewMaintenance() {
  const result = await runCommand("openclaw", ["tasks", "maintenance", "--json"], OPENCLAW_HOME);
  return {
    summary: "Maintenance preview completed",
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

export async function cancelRuntimeTask(lookup: string) {
  const result = await runCommand("openclaw", ["tasks", "cancel", lookup], OPENCLAW_HOME);
  return {
    summary: `Cancelled task ${lookup}`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

export async function cancelFlow(lookup: string) {
  const result = await runCommand("openclaw", ["tasks", "flow", "cancel", lookup], OPENCLAW_HOME);
  return {
    summary: `Cancelled flow ${lookup}`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

async function runControllerFlowAction(action: FlowAction, controllerId: string, lookup: string) {
  const handler = FLOW_CONTROLLER_COMMANDS[controllerId]?.[action];
  if (!handler) {
    throw new Error(`Flow action ${action} is not supported for controller ${controllerId}`);
  }
  const result = await handler(lookup);
  return parseJsonPayload(result.stdout || result.stderr);
}

export async function approveFlow(controllerId: string, lookup: string) {
  const payload = await runControllerFlowAction("approve", controllerId, lookup);
  return {
    summary: `Approved flow ${lookup}`,
    payload,
  };
}

export async function deleteFlow(controllerId: string, lookup: string) {
  const payload = await runControllerFlowAction("delete", controllerId, lookup);
  return {
    summary: `Deleted flow ${lookup}`,
    payload,
  };
}

export async function moveObsidianTask(id: string, status: string) {
  const result = await runCommandWithStdin(
    OC_PYTHON,
    [TASK_BOARD_WRAPPER, "save-task", "--stdin-json"],
    OPENCLAW_HOME,
    JSON.stringify({ id, status }),
  );
  return {
    summary: `Moved task ${id} to ${status}`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

export async function archiveObsidianTasks(ids: string[]) {
  const result = await runCommand(OC_PYTHON, [TASK_BOARD_WRAPPER, "move-to-attic", "--ids", ...ids], OPENCLAW_HOME);
  return {
    summary: `Archived ${ids.length} Obsidian task${ids.length === 1 ? "" : "s"}`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

export async function loadObsidianTaskBoard(): Promise<ObsidianBoardPayload> {
  try {
    const result = await runCommand(OC_PYTHON, [TASK_BOARD_WRAPPER, "export-board"], OPENCLAW_HOME);
    return parseJsonPayload(result.stdout || result.stderr) as ObsidianBoardPayload;
  } catch {
    return {
      generated_at: new Date().toISOString(),
      file: "",
      details_dir: "",
      tasks: [],
      columns: [],
      lint: { ok: true, file: "", task_count: 0, errors: [], warnings: [] },
    };
  }
}

export async function markObsidianTasksDone(ids: string[]) {
  const saved = [];
  for (const id of ids) {
    const result = await runCommandWithStdin(
      OC_PYTHON,
      [TASK_BOARD_WRAPPER, "save-task", "--stdin-json"],
      OPENCLAW_HOME,
      JSON.stringify({ id, status: "done" }),
    );
    const payload = parseJsonPayload(result.stdout || result.stderr) as { saved?: unknown };
    saved.push(payload.saved ?? payload);
  }
  return {
    summary: `Marked ${ids.length} Obsidian task${ids.length === 1 ? "" : "s"} done`,
    payload: { saved },
  };
}

export async function saveObsidianTask(payload: Record<string, unknown>) {
  const result = await runCommandWithStdin(
    OC_PYTHON,
    [TASK_BOARD_WRAPPER, "save-task", "--stdin-json"],
    OPENCLAW_HOME,
    JSON.stringify(payload),
  );
  return {
    summary: `Saved task ${String(payload.id ?? "")}`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}

export async function replayEvent(source: string, payloadPath: string) {
  if (source === "fathom") {
    const result = await runCommand(
      OC_PYTHON,
      [FATHOM_SYNC_SCRIPT, "process-webhook-file", "--webhook-file", payloadPath, "--apply", "--require-approval=false"],
      OPENCLAW_HOME,
    );
    return {
      summary: `Replayed ${source} event`,
      payload: parseJsonPayload(result.stdout || result.stderr),
    };
  }
  if (source === "agentmail") {
    const result = await runCommand("python3", [AGENTMAIL_ROUTER_SCRIPT, "recover-queue-file", "--queue-file", payloadPath], OPENCLAW_HOME);
    return {
      summary: `Recovered ${source} queue event`,
      payload: parseJsonPayload(result.stdout || result.stderr),
    };
  }
  throw new Error(`Replay is not supported for source ${source}`);
}
