import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { refreshMissionControlState } from "../../../worker/src/refresh";
import { AGENTMAIL_ROUTER_SCRIPT, FATHOM_SYNC_SCRIPT, INVOICE_AGENT_WRAPPER, OBSIDIAN_VAULT, OPENCLAW_HOME, TASK_BOARD_WRAPPER } from "./config";

const execFileAsync = promisify(execFile);
const OC_PYTHON = "/Users/fonkey-oc/bin/oc-python";
const MEMORY_MAINTENANCE_SCRIPT = `${OPENCLAW_HOME}/workspace/scripts/memory_maintenance.py`;
const SELF_EVOLUTION_REVIEW_ROOT = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Self-Evolution", "Review Packets");
const SELF_EVOLUTION_CANONICAL_DIR = path.join(SELF_EVOLUTION_REVIEW_ROOT, "Packets");
const SELF_EVOLUTION_ATTIC_DIR = path.join(SELF_EVOLUTION_REVIEW_ROOT, "Attic");
const TASK_DETAIL_ROOT = path.join(OBSIDIAN_VAULT, "Tasks", "Details");

function slugifyPacketKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96) || "packet";
}

function packetCanonicalKey(packet: { dedupeKey?: string | null; title?: string | null; id: string }) {
  return slugifyPacketKey(packet.dedupeKey || packet.title || packet.id);
}

function packetCanonicalPath(key: string) {
  return path.join(SELF_EVOLUTION_CANONICAL_DIR, `${slugifyPacketKey(key)}.md`);
}

function packetAtticPath(key: string) {
  return path.join(SELF_EVOLUTION_ATTIC_DIR, `${slugifyPacketKey(key)}.md`);
}

function ensureDirectory(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath: string) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function writeText(filePath: string, text: string) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function parseFrontmatter(markdown: string | null) {
  if (!markdown?.startsWith("---\n")) {
    return { metadata: {} as Record<string, string>, body: markdown ?? "" };
  }
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) {
    return { metadata: {} as Record<string, string>, body: markdown };
  }
  const metadata: Record<string, string> = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (match) {
      metadata[match[1]] = match[2].replace(/^"|"$/gu, "").trim();
    }
  }
  return { metadata, body: markdown.slice(end + 4).replace(/^\n+/, "") };
}

function renderFrontmatter(metadata: Record<string, string | null | undefined>) {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${String(value).includes(":") ? JSON.stringify(value) : value}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function findLatestReviewNote(packetId: string) {
  try {
    const files = fs.readdirSync(SELF_EVOLUTION_REVIEW_ROOT)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .reverse();
    for (const name of files) {
      const filePath = path.join(SELF_EVOLUTION_REVIEW_ROOT, name);
      const markdown = readText(filePath);
      if (markdown?.includes(`### ${packetId} `) || markdown?.includes(`### ${packetId}\n`)) {
        return { filePath, markdown, date: name.replace(/\.md$/, "") };
      }
    }
  } catch {}
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPacketSection(noteMarkdown: string | null, packetId: string) {
  if (!noteMarkdown) {
    return null;
  }
  const escaped = escapeRegExp(packetId);
  const pattern = new RegExp(`^###\\s+${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=^###\\s+|^##\\s+|(?![\\s\\S]))`, "mu");
  const match = noteMarkdown.match(pattern);
  if (!match) {
    return null;
  }
  const heading = noteMarkdown.match(new RegExp(`^###\\s+${escaped}\\b[^\\n]*`, "mu"))?.[0] ?? `### ${packetId}`;
  return `${heading}\n\n${match[1].trim()}`.trim();
}

type SelfEvolutionPacketMutation = {
  packetId: string;
  dedupeKey?: string | null;
  title?: string | null;
  status?: string | null;
  approvalClassification?: string | null;
  reviewTaskId?: string | null;
  mode?: "approve" | "discard" | "sync";
};

function ensureCanonicalPacketRecord(input: SelfEvolutionPacketMutation) {
  const source = findLatestReviewNote(input.packetId);
  const fallbackTitle = input.title || input.packetId;
  const section = extractPacketSection(source?.markdown ?? null, input.packetId) ?? `### ${input.packetId} - ${fallbackTitle}\n`;
  const canonicalKey = packetCanonicalKey({ id: input.packetId, dedupeKey: input.dedupeKey, title: input.title ?? fallbackTitle });
  const canonicalPath = packetCanonicalPath(canonicalKey);
  const atticPath = packetAtticPath(canonicalKey);
  const existingPath = fs.existsSync(canonicalPath) ? canonicalPath : fs.existsSync(atticPath) ? atticPath : null;
  const existing = parseFrontmatter(existingPath ? readText(existingPath) : null);
  const titleMatch = section.match(/^###\s+[^-]+-\s+(.+)$/m);
  const title = input.title || existing.metadata.title || titleMatch?.[1]?.trim() || fallbackTitle;
  const status = input.status || existing.metadata.status || "review";
  const reviewTaskId = input.reviewTaskId || existing.metadata.review_task || null;
  const metadata = {
    packet_id: input.packetId,
    canonical_key: canonicalKey,
    dedupe_key: input.dedupeKey || existing.metadata.dedupe_key || canonicalKey,
    title,
    status,
    approval_classification: input.approvalClassification || existing.metadata.approval_classification || null,
    review_task: reviewTaskId,
    source_note: source ? path.relative(OBSIDIAN_VAULT, source.filePath).split(path.sep).join("/") : existing.metadata.source_note || null,
    first_seen: existing.metadata.first_seen || source?.date || null,
    last_seen: source?.date || existing.metadata.last_seen || null,
  };
  const rendered = renderFrontmatter(metadata) + section.trim() + "\n";
  const targetPath = input.mode === "discard" ? atticPath : canonicalPath;
  if (existingPath && existingPath !== targetPath && fs.existsSync(existingPath)) {
    ensureDirectory(path.dirname(targetPath));
    fs.renameSync(existingPath, targetPath);
  }
  writeText(targetPath, rendered);
  return { canonicalKey, path: targetPath, metadata };
}

function updateTaskDetailResults(taskId: string, line: string) {
  if (!taskId) {
    return;
  }
  try {
    const file = fs.readdirSync(TASK_DETAIL_ROOT).find((name) => name.startsWith(`${taskId}-`) && name.endsWith(".md"));
    if (!file) {
      return;
    }
    const filePath = path.join(TASK_DETAIL_ROOT, file);
    const markdown = readText(filePath);
    if (!markdown || markdown.includes(line)) {
      return;
    }
    const marker = "\n## Results\n";
    if (markdown.includes(marker)) {
      writeText(filePath, markdown.replace(marker, `${marker}${line}\n`));
      return;
    }
    writeText(filePath, `${markdown.trimEnd()}${marker}${line}\n`);
  } catch {}
}


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

export async function syncSelfEvolutionPacket(payload: {
  packetId: string;
  dedupeKey?: string | null;
  title?: string | null;
  status?: string | null;
  approvalClassification?: string | null;
  reviewTaskId?: string | null;
}) {
  const result = ensureCanonicalPacketRecord({ ...payload, mode: "sync" });
  return {
    summary: `Synced packet ${payload.packetId}`,
    payload: result,
  };
}

export async function approveSelfEvolutionPacket(payload: {
  packetId: string;
  dedupeKey?: string | null;
  title?: string | null;
  approvalClassification?: string | null;
  reviewTaskId?: string | null;
}) {
  const result = ensureCanonicalPacketRecord({ ...payload, status: "approved", mode: "approve" });
  if (payload.reviewTaskId) {
    updateTaskDetailResults(payload.reviewTaskId, `- Approved ${payload.packetId}: [[${path.relative(OBSIDIAN_VAULT, result.path).replace(/\.md$/, "").split(path.sep).join("/")}|${payload.packetId}]]`);
  }
  return {
    summary: `Approved self-evolution packet ${payload.packetId}`,
    payload: result,
  };
}

export async function discardSelfEvolutionPacket(payload: {
  packetId: string;
  dedupeKey?: string | null;
  title?: string | null;
  approvalClassification?: string | null;
  reviewTaskId?: string | null;
}) {
  const result = ensureCanonicalPacketRecord({ ...payload, status: "discarded", mode: "discard" });
  if (payload.reviewTaskId) {
    updateTaskDetailResults(payload.reviewTaskId, `- Discarded ${payload.packetId}: moved to attic`);
  }
  return {
    summary: `Discarded self-evolution packet ${payload.packetId}`,
    payload: result,
  };
}
