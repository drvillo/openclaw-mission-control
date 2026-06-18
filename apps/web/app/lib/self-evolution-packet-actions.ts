import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { OPENCLAW_HOME, OBSIDIAN_VAULT, TASK_BOARD_WRAPPER } from "./config";
import { loadDashboardState } from "./mission-control";
import { DEFAULT_PACKET_AGENT_ID, normalizePacketRuntimeAgent, packetRuntimeAgentReason } from "./runtime-agent-catalog";
import { submitRuntimeInvocation, type RuntimeInvocationInput } from "./runtime-bridge";

const execFileAsync = promisify(execFile);
const OC_PYTHON = "/Users/fonkey-oc/bin/oc-python";
const PACKETS_DIR = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Self-Evolution", "Review Packets", "Packets");
const ATTIC_DIR = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Self-Evolution", "Review Packets", "Attic");

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96) || "packet";
}

function packetPath(dir: string, key: string) {
  return path.join(dir, `${slugify(key)}.md`);
}

function frontmatterValue(value: string | null | undefined) {
  return JSON.stringify(value ?? "");
}

function canonicalPacketMarkdown(packet: ReturnType<typeof loadDashboardState>["selfEvolution"]["packets"][number], status: string) {
  const body = packet.document?.markdown ?? `### ${packet.id} - ${packet.title}\n\n_No improvement body found in the daily note._`;
  const sourceDates = packet.dates.length > 0 ? packet.dates : [packet.date];
  return `---\ncanonical_key: ${frontmatterValue(packet.canonicalKey)}\ndedupe_key: ${frontmatterValue(packet.dedupeKey ?? packet.canonicalKey)}\nid: ${frontmatterValue(packet.id)}\ntitle: ${frontmatterValue(packet.title)}\nstatus: ${frontmatterValue(status)}\nsource_dates: ${frontmatterValue(sourceDates.join(", "))}\nupdated_at: ${frontmatterValue(new Date().toISOString())}\n---\n\n# ${packet.title}\n\n- Improvement ID: ${packet.id}\n- Canonical key: ${packet.canonicalKey}\n- Domain: ${packet.domain}\n- Complexity: ${packet.complexity}\n- Risk: ${packet.risk}\n- Status: ${status}\n- Source days: ${sourceDates.join(", ")}\n\n## Improvement body\n\n${body}\n`;
}

function findPacket(packetKey: string) {
  const state = loadDashboardState().selfEvolution;
  const packet = state.packets.find((item) => item.canonicalKey === packetKey || item.id === packetKey || item.dedupeKey === packetKey);
  if (!packet) {
    throw new Error(`Self-evolution packet not found: ${packetKey}`);
  }
  return packet;
}

async function createImplementationTask(packet: ReturnType<typeof findPacket>, canonicalPath: string, agentId: string) {
  const existing = await findImplementationTask(packet);
  if (existing) {
    const updated = await updateImplementationTaskAssignee(existing, agentId);
    return { created: updated, reused: true };
  }
  const payload = {
    title: `Implement self-evolution improvement: ${packet.title}`,
    status: "next",
    assignee_type: "agent",
    assignee: agentId,
    agent_status: "queued",
    details: `# Implement self-evolution improvement: ${packet.title}\n\n- Source improvement: [[${path.relative(OBSIDIAN_VAULT, canonicalPath).replace(/\\.md$/u, "")}]]\n- Improvement path: ${canonicalPath}\n- Improvement ID: ${packet.id}\n- Canonical key: ${packet.canonicalKey}\n- Domain: ${packet.domain}\n- Complexity: ${packet.complexity}\n- Risk: ${packet.risk}\n\n## Request\n\nImplement the improvement described in the linked Supervised Self-Evolution note. Plan and test according to the SDLC.\n\n## Acceptance Criteria\n- Read the linked improvement note before making changes.\n- Implement the smallest safe change that satisfies the improvement.\n- Run targeted verification and typecheck/lint/build where relevant.\n- Update this task detail note with changed files, verification, and any blockers.\n\n## Execution Log\n- Created by Mission Control improvement execution for ${agentId}.\n\n## Results\n_TBD_\n`,
  };
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "create", "--json-input", JSON.stringify(payload)], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 5,
  });
  const created = JSON.parse(result.stdout.trim() || "{}");
  const taskId = created.created?.id;
  const resolved = taskId ? await findTaskById(taskId) : null;
  return { ...created, created: resolved ?? created.created, reused: false };
}

async function updateTaskBoard(payload: Record<string, unknown>) {
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "update", "--json-input", JSON.stringify(payload)], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 5,
  });
  return JSON.parse(result.stdout.trim() || "{}");
}

async function exportTaskBoard() {
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "export-board"], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
  });
  return JSON.parse(result.stdout.trim() || "{}");
}

async function findTaskById(taskId: string) {
  const board = await exportTaskBoard();
  return board.tasks?.find((task: { id?: string }) => task.id === taskId) ?? null;
}

async function findImplementationTask(packet: ReturnType<typeof findPacket>) {
  const board = await exportTaskBoard();
  const title = `Implement self-evolution improvement: ${packet.title}`;
  const legacyTitle = `Implement self-evolution packet: ${packet.title}`;
  return (
    board.tasks?.find(
      (task: { title?: string; detail_body?: string | null }) =>
        task.title === title ||
        task.title === legacyTitle ||
        task.detail_body?.includes(`Canonical key: ${packet.canonicalKey}`) ||
        task.detail_body?.includes(`Packet ID: ${packet.id}`) ||
        task.detail_body?.includes(`Improvement ID: ${packet.id}`),
    ) ?? null
  );
}

async function updateImplementationTaskAssignee(task: { id?: string; assignee_type?: string | null; assignee?: string | null }, agentId: string) {
  if (!task?.id || (task.assignee_type === "agent" && task.assignee === agentId)) {
    return task;
  }
  await updateTaskBoard({ id: task.id, assignee_type: "agent", assignee: agentId, agent_status: "queued" });
  return (await findTaskById(task.id)) ?? task;
}

function appendExecutionLog(detailsPath: string | null | undefined, line: string) {
  if (!detailsPath || !existsSync(detailsPath)) {
    return;
  }
  const markdown = readFileSync(detailsPath, "utf8");
  if (markdown.includes(line)) {
    return;
  }
  const marker = "\n## Execution Log\n";
  if (markdown.includes(marker)) {
    writeFileSync(detailsPath, markdown.replace(marker, `${marker}${line}\n`));
    return;
  }
  writeFileSync(detailsPath, `${markdown.trimEnd()}\n\n## Execution Log\n${line}\n`);
}

export async function approveSelfEvolutionPacket(packetKey: string, requestedAgentId?: string) {
  const agentId = normalizePacketRuntimeAgent(requestedAgentId);
  const packet = findPacket(packetKey);
  mkdirSync(PACKETS_DIR, { recursive: true });
  const canonicalPath = packetPath(PACKETS_DIR, packet.canonicalKey);
  writeFileSync(canonicalPath, canonicalPacketMarkdown(packet, "approved"));
  const task = await createImplementationTask(packet, canonicalPath, agentId);
  const implementationTask = task.created;
  const invocationInput: RuntimeInvocationInput = {
    kind: "self-evolution.packet.execute",
    title: `Execute self-evolution improvement: ${packet.title}`,
    agentId,
    instruction: "Implement the approved supervised self-evolution improvement using the referenced Obsidian task detail note as the canonical work contract. Follow the coding-agent SDLC where code changes are involved: inspect, plan, implement, verify, document results.",
    idempotencyKey: `self-evolution:${packet.canonicalKey}:execute:v1`,
    mcObjectType: "self-evolution-improvement",
    mcObjectId: packet.canonicalKey,
    obsidianTaskId: implementationTask?.id ?? null,
    detailsPath: implementationTask?.detail_path ?? null,
    timeoutSeconds: 900,
    contextRefs: [
      ...(implementationTask
        ? [
            {
              type: "obsidian-task" as const,
              taskId: implementationTask.id,
              detailsRef: implementationTask.details_ref,
              detailsPath: implementationTask.detail_path,
            },
          ]
        : []),
      { type: "obsidian-note", path: canonicalPath, title: packet.title },
      { type: "mission-control-object", objectType: "self-evolution-improvement", objectId: packet.canonicalKey },
    ],
    metadata: {
      packetId: packet.id,
      improvementId: packet.id,
      canonicalKey: packet.canonicalKey,
      defaultAgentId: DEFAULT_PACKET_AGENT_ID,
      selectedAgentId: agentId,
      agentSelectionReason: packetRuntimeAgentReason(agentId),
      taskReused: String(Boolean(task.reused)),
    },
  };
  const invocation = await submitRuntimeInvocation(invocationInput);
  appendExecutionLog(
    implementationTask?.detail_path ?? null,
    `- ${new Date().toISOString()} · Mission Control approve+execute → ${agentId} · invocation ${invocation.record.id} · status ${invocation.record.status}${invocation.record.runId ? ` · run ${invocation.record.runId}` : ""}${invocation.record.sessionKey ? ` · session ${invocation.record.sessionKey}` : ""}${invocation.record.runtimeTaskId ? ` · runtime task ${invocation.record.runtimeTaskId}` : ""}${invocation.record.error ? ` · note: ${invocation.record.error}` : ""}`,
  );
  return {
    summary: invocation.duplicate
      ? `Accepted ${packet.id}; execution was already submitted for ${implementationTask?.id ?? packet.canonicalKey}.`
      : `Accepted ${packet.id}, prepared ${implementationTask?.id ?? "implementation task"}, and submitted ${agentId} execution.`,
    payload: { packet: packet.canonicalKey, canonicalPath, task, invocation },
  };
}

export async function discardSelfEvolutionPacket(packetKey: string) {
  const packet = findPacket(packetKey);
  mkdirSync(ATTIC_DIR, { recursive: true });
  const canonicalPath = packetPath(PACKETS_DIR, packet.canonicalKey);
  const atticPath = packetPath(ATTIC_DIR, packet.canonicalKey);
  if (existsSync(canonicalPath)) {
    renameSync(canonicalPath, atticPath);
  } else {
    writeFileSync(atticPath, canonicalPacketMarkdown(packet, "discarded"));
  }
  return {
    summary: `Discarded ${packet.id} to the self-evolution attic.`,
    payload: { packet: packet.canonicalKey, atticPath },
  };
}
