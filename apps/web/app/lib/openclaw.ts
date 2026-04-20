import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { refreshMissionControlState } from "../../../worker/src/refresh";
import { FATHOM_SYNC_SCRIPT, OPENCLAW_HOME, TASK_BOARD_WRAPPER } from "./config";

const execFileAsync = promisify(execFile);

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

async function runCommand(command: string, args: string[], cwd: string) {
  const childEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete childEnv.OPENCLAW_HOME;
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
    env: childEnv,
  });
  return { stdout, stderr };
}

async function runCommandWithStdin(command: string, args: string[], cwd: string, stdin: string) {
  const childEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete childEnv.OPENCLAW_HOME;

  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv,
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

export async function refreshDerivedState() {
  return {
    summary: "Worker refresh completed",
    payload: await refreshMissionControlState(),
  };
}

export async function runMemoryDoctor() {
  return {
    summary: "Memory doctor completed",
    payload: await refreshMissionControlState({ applyMemoryDoctor: true }),
  };
}

export async function previewReconciliation() {
  const active = await runCommand("python3", [TASK_BOARD_WRAPPER, "list-agent-active"], OPENCLAW_HOME);
  const payload = JSON.parse(active.stdout.trim() || "{}");
  const reconcile = await runCommandWithStdin(
    "python3",
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

export async function replayEvent(source: string, payloadPath: string) {
  if (source !== "fathom") {
    throw new Error(`Replay is not supported for source ${source}`);
  }
  const result = await runCommand(
    "python3",
    [FATHOM_SYNC_SCRIPT, "process-webhook-file", "--webhook-file", payloadPath, "--apply", "--require-approval=false"],
    OPENCLAW_HOME,
  );
  return {
    summary: `Replayed ${source} event`,
    payload: parseJsonPayload(result.stdout || result.stderr),
  };
}
