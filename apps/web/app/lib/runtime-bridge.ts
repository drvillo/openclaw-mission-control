import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { openMissionControlDb } from "@ocmc/db";
import { MISSION_CONTROL_DB_PATH, OPENCLAW_HOME } from "./config";

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = "/Users/fonkey-oc/.nvm/versions/node/v22.22.1/bin/openclaw";

export type RuntimeContextRef =
  | { type: "obsidian-task"; taskId: string; detailsRef: string; detailsPath: string }
  | { type: "obsidian-note"; path: string; title?: string }
  | { type: "mission-control-object"; objectType: string; objectId: string; snapshotPath?: string };

export type RuntimeInvocationInput = {
  kind: string;
  title: string;
  agentId: string;
  contextRefs: RuntimeContextRef[];
  instruction: string;
  idempotencyKey: string;
  mcObjectType?: string | null;
  mcObjectId?: string | null;
  obsidianTaskId?: string | null;
  detailsPath?: string | null;
  model?: string | null;
  thinking?: string | null;
  timeoutSeconds?: number | null;
  metadata?: Record<string, string>;
};

export type RuntimeInvocationRecord = RuntimeInvocationInput & {
  id: string;
  status: "submitted" | "running" | "succeeded" | "failed";
  sessionKey: string | null;
  runId: string | null;
  runtimeTaskId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
};

type AgentRunner = (input: RuntimeInvocationInput) => Promise<{ stdout: string; stderr: string }>;

type CliPayload = Record<string, unknown>;

function nowIso() {
  return new Date().toISOString();
}

function stableInvocationId(idempotencyKey: string) {
  return `mcinv_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
}

function clip(value: string, max = 240) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function parseCliJson(stdout: string): CliPayload {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("OpenClaw CLI returned an empty response.");
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`OpenClaw CLI returned ${typeof parsed}, expected an object.`);
    }
    return parsed as CliPayload;
  } catch {
    throw new Error(`OpenClaw CLI returned malformed JSON: ${clip(trimmed)}`);
  }
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractRunRefs(payload: CliPayload) {
  const meta = payload.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : {};
  return {
    runId: stringField(payload.runId) ?? stringField(payload.run_id) ?? stringField(meta.runId) ?? stringField(meta.run_id),
    sessionKey: stringField(payload.sessionKey) ?? stringField(payload.session_key) ?? stringField(meta.sessionKey) ?? stringField(meta.session_key),
    runtimeTaskId: stringField(payload.taskId) ?? stringField(payload.task_id) ?? stringField(meta.taskId) ?? stringField(meta.task_id),
  };
}

function payloadError(payload: CliPayload) {
  return stringField(payload.error) ?? stringField(payload.message) ?? null;
}

function normalizeTerminalError(error: unknown) {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; stderr?: unknown; stdout?: unknown };
    const parts = [stringField(maybe.message), stringField(maybe.stderr), stringField(maybe.stdout)].filter(Boolean);
    if (parts.length > 0) {
      return clip(parts.join(" | "), 400);
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function resolveRuntimeStatus(payload: CliPayload, refs: ReturnType<typeof extractRunRefs>): RuntimeInvocationRecord["status"] {
  const rawStatus = stringField(payload.status)?.toLowerCase();
  if (rawStatus === "failed" || rawStatus === "error") {
    return "failed";
  }
  if (rawStatus === "submitted" || rawStatus === "queued" || rawStatus === "running" || rawStatus === "in_progress") {
    return "running";
  }
  if (!refs.runId && !refs.sessionKey && !refs.runtimeTaskId) {
    throw new Error(`OpenClaw CLI response did not include runtime identifiers: ${clip(JSON.stringify(payload))}`);
  }
  return "succeeded";
}

function buildAgentPrompt(input: RuntimeInvocationInput) {
  const contextLines = input.contextRefs.map((ref) => {
    if (ref.type === "obsidian-task") {
      return `- Obsidian task: ${ref.taskId}\n  - Details ref: ${ref.detailsRef}\n  - Details path: ${ref.detailsPath}`;
    }
    if (ref.type === "obsidian-note") {
      return `- Obsidian note: ${ref.path}${ref.title ? ` (${ref.title})` : ""}`;
    }
    return `- Mission Control object: ${ref.objectType}:${ref.objectId}${ref.snapshotPath ? `\n  - Snapshot: ${ref.snapshotPath}` : ""}`;
  });

  return `Mission Control runtime invocation\n\nKind: ${input.kind}\nTitle: ${input.title}\nInvocation idempotency key: ${input.idempotencyKey}\n\nInstruction:\n${input.instruction}\n\nContext artifacts to read before acting:\n${contextLines.join("\n")}\n\nRules:\n- Treat the Obsidian task/detail note as the canonical work contract.\n- Do not replace or bypass task-ops.\n- Update the task detail Execution Log and Results with what changed and verification.\n- Report blockers explicitly if execution cannot be completed.\n`;
}

async function cliAgentRunner(input: RuntimeInvocationInput) {
  const args = ["agent", "--agent", input.agentId, "--message", buildAgentPrompt(input), "--json"];
  if (input.model) {
    args.push("--model", input.model);
  }
  if (input.thinking) {
    args.push("--thinking", input.thinking);
  }
  if (input.timeoutSeconds) {
    args.push("--timeout", String(input.timeoutSeconds));
  }
  return await execFileAsync(OPENCLAW_BIN, args, {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
    env: { ...process.env, PATH: `/Users/fonkey-oc/.nvm/versions/node/v22.22.1/bin:${process.env.PATH ?? ""}` },
  });
}

function rowToRecord(row: Record<string, unknown>): RuntimeInvocationRecord {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    kind: String(row.kind),
    title: String(row.title),
    agentId: String(row.agent_id),
    instruction: String(row.instruction),
    contextRefs: JSON.parse(String(row.context_refs_json || "[]")) as RuntimeContextRef[],
    mcObjectType: stringField(row.mc_object_type),
    mcObjectId: stringField(row.mc_object_id),
    obsidianTaskId: stringField(row.obsidian_task_id),
    detailsPath: stringField(row.details_path),
    model: stringField(row.model),
    thinking: stringField(row.thinking),
    timeoutSeconds: typeof row.timeout_seconds === "number" ? row.timeout_seconds : null,
    metadata: JSON.parse(String(row.metadata_json || "{}")) as Record<string, string>,
    status: String(row.status) as RuntimeInvocationRecord["status"],
    sessionKey: stringField(row.session_key),
    runId: stringField(row.run_id),
    runtimeTaskId: stringField(row.runtime_task_id),
    error: stringField(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    terminalAt: stringField(row.terminal_at),
  };
}

export function getRuntimeInvocationByIdempotencyKey(idempotencyKey: string) {
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const row = db.prepare("SELECT * FROM runtime_invocations WHERE idempotency_key = ?").get(idempotencyKey) as Record<string, unknown> | undefined;
    return row ? rowToRecord(row) : null;
  } finally {
    db.close();
  }
}

export async function submitRuntimeInvocation(input: RuntimeInvocationInput, runner: AgentRunner = cliAgentRunner) {
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  const now = nowIso();
  const id = stableInvocationId(input.idempotencyKey || randomUUID());
  try {
    const existing = db.prepare("SELECT * FROM runtime_invocations WHERE idempotency_key = ?").get(input.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing && !["failed", "succeeded"].includes(String(existing.status))) {
      return { record: rowToRecord(existing), duplicate: true };
    }

    db.prepare(`
      INSERT OR REPLACE INTO runtime_invocations (
        id, idempotency_key, kind, title, agent_id, instruction, context_refs_json,
        mc_object_type, mc_object_id, obsidian_task_id, details_path, model, thinking,
        timeout_seconds, metadata_json, status, session_key, run_id, runtime_task_id,
        error, created_at, updated_at, terminal_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NULL, NULL, NULL, NULL, ?, ?, NULL)
    `).run(
      id,
      input.idempotencyKey,
      input.kind,
      input.title,
      input.agentId,
      input.instruction,
      JSON.stringify(input.contextRefs),
      input.mcObjectType ?? null,
      input.mcObjectId ?? null,
      input.obsidianTaskId ?? null,
      input.detailsPath ?? null,
      input.model ?? null,
      input.thinking ?? null,
      input.timeoutSeconds ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
    );
  } finally {
    db.close();
  }

  try {
    const result = await runner(input);
    const payload = parseCliJson(result.stdout);
    if (payload.ok === false) {
      throw new Error(payloadError(payload) ?? "OpenClaw CLI reported a failed invocation.");
    }
    const refs = extractRunRefs(payload);
    const status = resolveRuntimeStatus(payload, refs);
    const executionError = payloadError(payload) ?? stringField(result.stderr) ?? null;
    const finishedAt = nowIso();
    const db2 = openMissionControlDb(MISSION_CONTROL_DB_PATH);
    try {
      db2.prepare(`
        UPDATE runtime_invocations
        SET status = ?, session_key = ?, run_id = ?, runtime_task_id = ?, error = ?, updated_at = ?, terminal_at = ?
        WHERE id = ?
      `).run(status, refs.sessionKey, refs.runId, refs.runtimeTaskId, executionError, finishedAt, status === "running" ? null : finishedAt, id);
      const row = db2.prepare("SELECT * FROM runtime_invocations WHERE id = ?").get(id) as Record<string, unknown>;
      return { record: rowToRecord(row), duplicate: false };
    } finally {
      db2.close();
    }
  } catch (error) {
    const finishedAt = nowIso();
    const db3 = openMissionControlDb(MISSION_CONTROL_DB_PATH);
    try {
      db3.prepare(`UPDATE runtime_invocations SET status = 'failed', error = ?, updated_at = ?, terminal_at = ? WHERE id = ?`).run(normalizeTerminalError(error), finishedAt, finishedAt, id);
      const row = db3.prepare("SELECT * FROM runtime_invocations WHERE id = ?").get(id) as Record<string, unknown>;
      return { record: rowToRecord(row), duplicate: false };
    } finally {
      db3.close();
    }
  }
}
