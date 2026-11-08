import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { OPENCLAW_HOME, OBSIDIAN_VAULT, TASK_BOARD_WRAPPER } from "./config";
import { loadDashboardState, selfEvolutionPacketKey, type DashboardSelfEvolutionPacket } from "./mission-control";
import { DEFAULT_PACKET_AGENT_ID, normalizePacketRuntimeAgent, packetRuntimeAgentReason } from "./runtime-agent-catalog";
import { submitRuntimeInvocation, type RuntimeInvocationInput } from "./runtime-bridge";

const execFileAsync = promisify(execFile);
const OC_PYTHON = "/Users/fonkey-oc/bin/oc-python";
const DUAL_ENTITY_RUNNER = path.join(OPENCLAW_HOME, "workspace", "scripts", "dual_entity_self_evolution.py");

type BoardTask = Record<string, unknown> & {
  id?: string;
  title?: string;
  detail_body?: string | null;
  detail_path?: string | null;
  details_ref?: string | null;
  assignee_type?: string | null;
  assignee?: string | null;
};

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function writeJson(filePath: string, data: Record<string, unknown>) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function stringifyList(items: string[]) {
  return items.length > 0 ? items.map((item) => `  - ${item}`).join("\n") : "  - none recorded";
}

async function runDualEntity(args: string[]) {
  const result = await execFileAsync(OC_PYTHON, [DUAL_ENTITY_RUNNER, ...args], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
  });
  return JSON.parse(result.stdout.trim() || "{}") as Record<string, unknown>;
}

async function updateTaskBoard(payload: Record<string, unknown>) {
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "update", "--json-input", JSON.stringify(payload)], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 5,
  });
  return JSON.parse(result.stdout.trim() || "{}") as Record<string, unknown>;
}

async function createTaskBoardTask(payload: Record<string, unknown>) {
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "create", "--json-input", JSON.stringify(payload)], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 5,
  });
  return JSON.parse(result.stdout.trim() || "{}") as Record<string, unknown>;
}

async function exportTaskBoard() {
  const result = await execFileAsync(OC_PYTHON, [TASK_BOARD_WRAPPER, "export-board"], {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
  });
  return JSON.parse(result.stdout.trim() || "{}") as { tasks?: BoardTask[] };
}

async function findTaskById(taskId: string) {
  const board = await exportTaskBoard();
  return board.tasks?.find((task) => task.id === taskId) ?? null;
}

async function findImplementationTask(proposal: DashboardSelfEvolutionPacket) {
  const board = await exportTaskBoard();
  const title = `Implement self-evolution proposal: ${proposal.title}`;
  return (
    board.tasks?.find((task) => {
      const detailBody = typeof task.detail_body === "string" ? task.detail_body : "";
      return task.title === title || detailBody.includes(`Proposal ID: ${proposal.id}`) || detailBody.includes(`Canonical key: ${proposal.canonicalKey}`);
    }) ?? null
  );
}

function proposalFromState(proposalKey: string) {
  const state = loadDashboardState().selfEvolution;
  const proposal = state.packets.find((item) => item.canonicalKey === proposalKey || item.id === proposalKey || item.dedupeKey === proposalKey || selfEvolutionPacketKey(item) === proposalKey);
  if (!proposal) {
    throw new Error(`Self-evolution proposal not found: ${proposalKey}`);
  }
  return proposal;
}

function matchingManualRunProposals(proposalKey: string) {
  const state = loadDashboardState().selfEvolution;
  const matches = new Map<string, { path: string; proposalId: string; canonicalKey: string }>();
  for (const packet of state.runs.flatMap((run) => run.packets)) {
    if (!packet.manualRunJsonPath) {
      continue;
    }
    if (packet.canonicalKey !== proposalKey && packet.id !== proposalKey && packet.dedupeKey !== proposalKey && selfEvolutionPacketKey(packet) !== proposalKey) {
      continue;
    }
    matches.set(`${packet.manualRunJsonPath}:${packet.id}`, {
      path: packet.manualRunJsonPath,
      proposalId: packet.id,
      canonicalKey: packet.canonicalKey,
    });
  }
  return [...matches.values()];
}

function proposalQuestionResolved(proposal: DashboardSelfEvolutionPacket) {
  return !proposal.approvalRequired || Boolean(proposal.questionAnswer?.trim());
}

function detailsRefToPath(detailsRef: unknown) {
  if (typeof detailsRef !== "string") {
    return null;
  }
  const match = detailsRef.match(/\[\[Tasks\/Details\/([^\]]+)\]\]/u);
  if (!match) {
    return null;
  }
  return path.join(OBSIDIAN_VAULT, "Tasks", "Details", match[1].endsWith(".md") ? match[1] : `${match[1]}.md`);
}

async function createOrReuseImplementationTask(proposal: DashboardSelfEvolutionPacket, agentId: string) {
  const existing = await findImplementationTask(proposal);
  if (existing) {
    if (existing.assignee_type !== "agent" || existing.assignee !== agentId) {
      await updateTaskBoard({ id: existing.id, assignee_type: "agent", assignee: agentId, agent_status: "queued" });
      return { task: (typeof existing.id === "string" ? await findTaskById(existing.id) : null) ?? existing, reused: true };
    }
    return { task: existing, reused: true };
  }

  const answerBlock = proposal.questionAnswer
    ? `\n## Francesco Answer\n\n- Answered at: ${proposal.answeredAt ?? "unknown"}\n- Answer: ${proposal.questionAnswer}\n${proposal.durableRule ? `- Durable rule: ${proposal.durableRule}\n` : ""}`
    : "";
  const details = `# Implement self-evolution proposal: ${proposal.title}\n\n- Manual run: ${proposal.date}\n- Manual run JSON: ${proposal.manualRunJsonPath ?? "unknown"}\n- Implementer report: ${proposal.implementerReportPath ?? "unknown"}\n- Proposal ID: ${proposal.id}\n- Canonical key: ${proposal.canonicalKey}\n- Proposal type: ${proposal.domain}\n- Approval boundary: ${proposal.approvalBoundary ?? "none"}\n- Implementer decision: ${proposal.decision ?? "unknown"}\n\n## Request\n\nImplement the manual dual-entity self-evolution proposal using this TaskOps task as the evolve point / unit of work. Read the manual run, implementer feedback, and referenced guidance before changing code or artifacts.\n\n## Proposal\n\n${proposal.summary}\n\n## User Value\n\n${proposal.userValue ?? "Not recorded."}\n\n## Implementer Feedback\n\n- Rationale: ${proposal.decisionRationale ?? "Not recorded."}\n- Evidence quality: ${proposal.evidenceQuality ?? "Not recorded."}\n- Generator feedback: ${proposal.generatorFeedback ?? "Not recorded."}\n\n## Evidence\n\n${stringifyList(proposal.evidence)}\n\n## Validation Requested\n\n${stringifyList(proposal.validation)}\n${answerBlock}\n## Acceptance Criteria\n- Keep the change scoped to this proposal.\n- Preserve TaskOps board visibility; update this task detail with results.\n- Write implementation feedback back to the manual run JSON proposal entry at \`${proposal.manualRunJsonPath ?? "unknown"}\` by setting \`implementation_feedback.decision\` to \`implemented\`, \`done\`, \`blocked\`, or \`rejected\` and recording validation/changed files where applicable.\n- Run targeted verification and typecheck/lint/build where relevant.\n- Stop and report if implementation needs destructive deletion, protected config/cron changes, external/public behavior, or privacy-sensitive access not explicitly approved.\n\n## Execution Log\n- Created by Mission Control manual dual-entity implementation trigger for ${agentId}.\n\n## Results\n_TBD_\n`;
  const created = await createTaskBoardTask({
    title: `Implement self-evolution proposal: ${proposal.title}`,
    status: "next",
    assignee_type: "agent",
    assignee: agentId,
    agent_status: "queued",
    details,
  });
  const taskId = (created.created as { id?: string } | undefined)?.id;
  return { task: (taskId ? (await findTaskById(taskId)) ?? created.created : created.created) as BoardTask | null | undefined, reused: false };
}

function appendExecutionLog(detailsPath: string | null, line: string) {
  if (!detailsPath || !existsSync(detailsPath)) {
    return;
  }
  const markdown = readFileSync(detailsPath, "utf8");
  if (markdown.includes(line)) {
    return;
  }
  const marker = "\n## Execution Log\n";
  if (markdown.includes(marker)) {
    writeFileSync(detailsPath, markdown.replace(marker, `${marker}${line}\n`), "utf8");
    return;
  }
  writeFileSync(detailsPath, `${markdown.trimEnd()}\n\n## Execution Log\n${line}\n`, "utf8");
}

export async function runManualDualEntityLoop() {
  const result = await runDualEntity(["run-manual"]);
  return {
    summary: result.ok ? `Generated manual run and implementer feedback: ${String(result.summary ?? "ok")}` : `Manual run completed with errors: ${JSON.stringify(result.errors ?? [])}`,
    payload: result,
  };
}

export async function recordSelfEvolutionProposalAnswer(proposalKey: string, answer: string, durableRule?: string) {
  const proposal = proposalFromState(proposalKey);
  const targets = matchingManualRunProposals(proposalKey);
  if (targets.length === 0) {
    if (!proposal.manualRunJsonPath) {
      throw new Error(`Proposal ${proposal.id} does not have a writable manual run JSON path.`);
    }
    targets.push({ path: proposal.manualRunJsonPath, proposalId: proposal.id, canonicalKey: proposal.canonicalKey });
  }

  const writtenPaths: string[] = [];
  const answeredAt = new Date().toISOString();
  for (const targetRef of targets) {
    const packet = readJson(targetRef.path);
    const proposals = Array.isArray(packet.proposals) ? packet.proposals : [];
    const target = proposals.find((row) => row && typeof row === "object" && (row as Record<string, unknown>).proposal_id === targetRef.proposalId) as Record<string, unknown> | undefined;
    if (!target) {
      throw new Error(`Proposal ${targetRef.proposalId} not found in ${targetRef.path}`);
    }
    const answers = Array.isArray(target.francesco_answers) ? target.francesco_answers : [];
    answers.push({ answered_at: answeredAt, answer, durable_rule: durableRule?.trim() || null });
    target.francesco_answers = answers;
    writeJson(targetRef.path, packet);
    writtenPaths.push(targetRef.path);
  }

  return {
    summary: `Recorded Francesco answer for ${proposal.id} in ${writtenPaths.length} manual run artifact${writtenPaths.length === 1 ? "" : "s"}.`,
    payload: { proposal: proposal.canonicalKey, manualRunJsonPaths: writtenPaths },
  };
}

export async function triggerSelfEvolutionProposalImplementation(proposalKey: string, requestedAgentId?: string) {
  const agentId = normalizePacketRuntimeAgent(requestedAgentId ?? DEFAULT_PACKET_AGENT_ID);
  const proposal = proposalFromState(proposalKey);
  if (!proposalQuestionResolved(proposal)) {
    throw new Error(`Proposal ${proposal.id} is blocked by ${proposal.approvalBoundary ?? "approval"}; record Francesco's answer before triggering implementation.`);
  }
  const { task, reused } = await createOrReuseImplementationTask(proposal, agentId);
  const implementationTask = (task ?? null) as BoardTask | null;
  const taskId = typeof implementationTask?.id === "string" ? implementationTask.id : null;
  const detailsPath = typeof implementationTask?.detail_path === "string" ? implementationTask.detail_path : detailsRefToPath(implementationTask?.details_ref);
  const invocationInput: RuntimeInvocationInput = {
    kind: "self-evolution.proposal.execute",
    title: `Execute self-evolution proposal: ${proposal.title}`,
    agentId,
    instruction: "Implement the approved manual dual-entity self-evolution proposal using the referenced TaskOps detail note as the canonical evolve point. Read the manual run and implementer feedback before acting. Follow the coding-agent SDLC where code changes are involved; stop for destructive/protected/external/privacy-sensitive changes not explicitly approved.",
    idempotencyKey: `self-evolution:proposal:${proposal.canonicalKey}:execute:v1`,
    mcObjectType: "self-evolution-proposal",
    mcObjectId: proposal.canonicalKey,
    obsidianTaskId: taskId,
    detailsPath,
    timeoutSeconds: 1800,
    contextRefs: [
      ...(taskId && detailsPath ? [{ type: "obsidian-task" as const, taskId, detailsRef: String(implementationTask?.details_ref ?? ""), detailsPath }] : []),
      ...(proposal.manualRunJsonPath ? [{ type: "obsidian-note" as const, path: proposal.manualRunJsonPath, title: `Manual run ${proposal.date}` }] : []),
      ...(proposal.implementerReportPath ? [{ type: "obsidian-note" as const, path: proposal.implementerReportPath, title: `Implementer feedback ${proposal.date}` }] : []),
      { type: "mission-control-object", objectType: "self-evolution-proposal", objectId: proposal.canonicalKey },
    ],
    metadata: {
      proposalId: proposal.id,
      canonicalKey: proposal.canonicalKey,
      manualRunId: proposal.date,
      defaultAgentId: DEFAULT_PACKET_AGENT_ID,
      selectedAgentId: agentId,
      agentSelectionReason: packetRuntimeAgentReason(agentId),
      taskReused: String(Boolean(reused)),
    },
  };
  const invocation = await submitRuntimeInvocation(invocationInput);
  appendExecutionLog(
    detailsPath,
    `- ${new Date().toISOString()} · Mission Control trigger → ${agentId} · invocation ${invocation.record.id} · status ${invocation.record.status}${invocation.record.runId ? ` · run ${invocation.record.runId}` : ""}${invocation.record.sessionKey ? ` · session ${invocation.record.sessionKey}` : ""}${invocation.record.runtimeTaskId ? ` · runtime task ${invocation.record.runtimeTaskId}` : ""}${invocation.record.error ? ` · note: ${invocation.record.error}` : ""}`,
  );
  return {
    summary: invocation.duplicate
      ? `Implementation was already submitted for ${taskId ?? proposal.canonicalKey}.`
      : `Prepared ${taskId ?? "implementation task"} and submitted ${agentId} implementation.`,
    payload: { proposal: proposal.canonicalKey, task, invocation },
  };
}
