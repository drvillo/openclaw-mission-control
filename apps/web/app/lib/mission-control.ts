import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import {
  MISSION_CONTROL_DB_PATH,
  OBSIDIAN_VAULT,
  OPENCLAW_HOME,
  SNAPSHOT_PATH,
  TASKS_ROOT,
  MISSION_CONTROL_STATE_DIR,
} from "./config";

type DatabaseSync = NodeDatabaseSync;
const require = createRequire(`${process.cwd()}/package.json`);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export type SnapshotRow = {
  generatedAt: string | null;
  tasks: { count: number; flows: number; findings: number; inbox: number; backlog: number };
  ingress: { total: number; bySource: Record<string, number> };
  routing: { total: number; failures: number; pending: number; compliant: number };
};

export type DashboardTask = {
  id: string;
  title: string;
  board: string;
  status: string;
  owner: string;
  assigneeType: string;
  assignee: string;
  agentStatus: string;
  createdOn: string;
  remindOn: string;
  runId: string | null;
  flowId: string | null;
  detailsRef: string;
  resultsRef: string;
  logRef: string;
  checked: number;
  recordedAt: string;
  rawJson: string;
  detailsPath: string | null;
  detailExists: boolean;
  detailBody: string | null;
};

export type DashboardRuntimeTask = {
  taskId: string;
  status: string;
  runtime: string | null;
  agentId: string | null;
  label: string | null;
  ownerKey: string | null;
  sourceId: string | null;
  runId: string | null;
  deliveryStatus: string | null;
  terminalSummary: string | null;
  terminalOutcome: string | null;
  createdAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  lastEventAt: number | null;
  cleanupAfter: number | null;
  activityAtMs: number | null;
  recordedAt: string;
  rawJson: string;
};

export type DashboardFlow = {
  flowId: string;
  syncMode: string | null;
  controllerId: string | null;
  status: string;
  ownerKey: string | null;
  goal: string | null;
  currentStep: string | null;
  blockedTaskId: string | null;
  blockedSummary: string | null;
  createdAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  lastEventAt: number | null;
  activityAtMs: number | null;
  recordedAt: string;
  rawJson: string;
};

export type DashboardEvent = {
  eventId: string;
  source: string;
  eventType: string;
  routeId: string | null;
  flowId: string | null;
  status: string;
  payloadPath: string | null;
  recordedAt: string;
};

export type DashboardFinding = {
  findingId: string;
  severity: string;
  code: string;
  kind: string;
  detail: string;
};

export type DashboardMemoryHealth = {
  workspaceId: string;
  status: string;
  rawJson: string;
  hasAgentsMd: number;
  hasMemoryMd: number;
  hasTodayDaily: number;
  latestDaily: string | null;
  qmdHealthy: number;
  qmdMessage: string;
  memoryScope: string;
  pathStatus: string;
  pathMessage: string;
  memoryDirPath: string | null;
  memoryFilePath: string | null;
  todayFilePath: string | null;
};

export type DashboardCronJob = {
  jobId: string;
  name: string;
  agentId: string;
  enabled: number;
  scheduleLabel: string;
  lastRunStatus: string | null;
  lastRunAtMs: number | null;
  nextRunAtMs: number | null;
  lastDurationMs: number | null;
};

export type DashboardCronRun = {
  runId: string;
  jobId: string;
  ts: number;
  status: string;
  action: string;
  summary: string | null;
  deliveryStatus: string | null;
  sessionId: string | null;
  sessionKey: string | null;
  runAtMs: number | null;
  durationMs: number | null;
  nextRunAtMs: number | null;
  model: string | null;
  provider: string | null;
  recordedAt: string;
  rawJson: string;
};

export type DashboardRoutingAttempt = {
  routingId: string;
  recordedAt: string;
  sourceAgent: string;
  sourceSessionId: string;
  sourceMessageId: string;
  requestGroupKey: string;
  requestExcerpt: string;
  policyDomain: string | null;
  expectedTargetAgent: string | null;
  actualTargetAgent: string | null;
  mechanism: string;
  accepted: number | null;
  childSessionKey: string | null;
  childSessionId: string | null;
  runId: string | null;
  status: string;
  completionSummary: string | null;
  failureMode: string;
  recoveryMode: string;
  complianceStatus: string;
  rawJson: string;
};

export type DashboardRoutingGroup = {
  requestGroupKey: string;
  requestExcerpt: string;
  sourceSessionId: string;
  latestRecordedAt: string;
  attempts: DashboardRoutingAttempt[];
};

export type DashboardSelfEvolutionLink = {
  label: string;
  path: string;
  href: string;
  exists: boolean;
  vaultPath: string;
  title: string;
  markdown: string | null;
  sectionId?: string | null;
};

export type DashboardSelfEvolutionReviewTask = {
  id: string;
  title: string | null;
  status: string | null;
  detailsRef: string | null;
  resultsRef: string | null;
  wikiRef: string | null;
};

export type DashboardRuntimeInvocation = {
  id: string;
  idempotencyKey: string;
  kind: string;
  title: string;
  agentId: string;
  status: string;
  obsidianTaskId: string | null;
  detailsPath: string | null;
  sessionKey: string | null;
  runId: string | null;
  runtimeTaskId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
  defaultAgentId: string | null;
  selectedAgentId: string | null;
  agentSelectionReason: string | null;
  mcObjectType?: string | null;
  mcObjectId?: string | null;
};

export type DashboardSelfEvolutionPacket = {
  date: string;
  dates: string[];
  generatedAt: string | null;
  id: string;
  title: string;
  summary: string;
  domain: string;
  analyzer: string | null;
  owner: string;
  value: number;
  risk: string;
  complexity: string;
  status: string | null;
  dedupeKey: string | null;
  canonicalKey: string;
  approvalClassification: string | null;
  approvalClass: string | null;
  approvalBoundary?: string | null;
  approvalRequired?: boolean;
  userValue?: string | null;
  capabilityHypothesis?: string | null;
  firstMinimumValuableVersion?: string | null;
  validationSignal?: string | null;
  riskOfNotBuilding?: string | null;
  decision?: string | null;
  decisionRationale?: string | null;
  evidenceQuality?: string | null;
  generatorFeedback?: string | null;
  questionAnswer?: string | null;
  durableRule?: string | null;
  answeredAt?: string | null;
  manualRunJsonPath?: string | null;
  implementerReportPath?: string | null;
  evidence: string[];
  rollback: string | null;
  validation: string[];
  sourceNote: string | null;
  note: DashboardSelfEvolutionLink;
  reviewTask: DashboardSelfEvolutionReviewTask | null;
  document: DashboardSelfEvolutionLink | null;
  attic: boolean;
  runtimeInvocation?: DashboardRuntimeInvocation | null;
};

export type DashboardSelfEvolutionRun = {
  date: string;
  generatedAt: string | null;
  allGatesOk: boolean | null;
  packetCount: number;
  reviewTask: DashboardSelfEvolutionReviewTask | null;
  gates: Array<{ name: string; ok: boolean }>;
  mutatingActions: Array<{ kind: string; target: string }>;
  note: DashboardSelfEvolutionLink;
  packets: DashboardSelfEvolutionPacket[];
};

export type DashboardSelfEvolution = {
  activeCronId: string;
  reviewRoot: string;
  reviewPacketsDir: string;
  indexPath: string;
  indexExists: boolean;
  latestNotePath: string | null;
  latestNoteExists: boolean;
  latestGeneratedAt: string | null;
  latestDate: string | null;
  allGatesOk: boolean | null;
  packetCount: number;
  reviewTaskId: string | null;
  reviewTaskStatus: string | null;
  gates: Array<{ name: string; ok: boolean }>;
  mutatingActions: Array<{ kind: string; target: string }>;
  runs: DashboardSelfEvolutionRun[];
  packets: DashboardSelfEvolutionPacket[];
  links: {
    index: DashboardSelfEvolutionLink;
    latestNote: DashboardSelfEvolutionLink | null;
    curriculum: DashboardSelfEvolutionLink;
    systemMap: DashboardSelfEvolutionLink;
    valuesModel: DashboardSelfEvolutionLink;
    evalCorpus: DashboardSelfEvolutionLink;
  };
};

export type DashboardState = {
  snapshot: SnapshotRow;
  tasks: DashboardTask[];
  runtimeTasks: DashboardRuntimeTask[];
  flows: DashboardFlow[];
  events: DashboardEvent[];
  findings: DashboardFinding[];
  memoryHealth: DashboardMemoryHealth[];
  cronJobs: DashboardCronJob[];
  cronRuns: DashboardCronRun[];
  routingAttempts: DashboardRoutingAttempt[];
  routingGroups: DashboardRoutingGroup[];
  selfEvolution: DashboardSelfEvolution;
  roots: {
    openclawHome: string;
    tasksRoot: string;
    stateDir: string;
    dbPath: string;
  };
};

export type DashboardOpsNextAction = {
  id: string;
  source: "self-evolution" | "runtime" | "taskflow" | "cron" | "memory" | "routing" | "audit" | "system";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  summary: string;
  owner: string;
  rationale: string;
  evidence: string[];
  href: string | null;
};

type RankedOpsNextAction = {
  score: number;
  item: DashboardOpsNextAction;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_-]+/gu, "_") ?? "";
}

function opsPriority(score: number): DashboardOpsNextAction["priority"] {
  if (score >= 100) {
    return "critical";
  }
  if (score >= 80) {
    return "high";
  }
  if (score >= 55) {
    return "medium";
  }
  return "low";
}

function pushOpsCandidate(candidates: RankedOpsNextAction[], score: number, item: Omit<DashboardOpsNextAction, "priority">) {
  candidates.push({ score, item: { ...item, priority: opsPriority(score) } });
}

export function buildOpsNextActionItems(state: Pick<DashboardState, "snapshot" | "runtimeTasks" | "flows" | "findings" | "memoryHealth" | "cronJobs" | "selfEvolution">, limit = 2): DashboardOpsNextAction[] {
  const candidates: RankedOpsNextAction[] = [];
  const activeProposals = state.selfEvolution.packets.filter((packet) => !packet.attic && !["done", "discarded"].includes(normalizeStatus(packet.status)));
  const blockedProposal = activeProposals.find((packet) => packet.approvalRequired && !packet.questionAnswer?.trim());
  if (blockedProposal) {
    pushOpsCandidate(candidates, 105, {
      id: `self-evolution-blocked-${blockedProposal.canonicalKey}`,
      source: "self-evolution",
      title: "Answer blocked self-evolution proposal",
      summary: blockedProposal.title,
      owner: blockedProposal.owner || "main",
      rationale: "A proposal cannot move until its approval/question boundary is resolved.",
      evidence: [`Approval boundary: ${blockedProposal.approvalBoundary ?? blockedProposal.approvalClass ?? "required"}`, `Status: ${packetStatusText(blockedProposal.status)}`],
      href: `/self-evolution/day/${encodeURIComponent(blockedProposal.date)}?packet=${encodeURIComponent(blockedProposal.id)}`,
    });
  } else if (activeProposals.length > 0) {
    const topProposal = [...activeProposals].sort((left, right) => right.value - left.value)[0];
    pushOpsCandidate(candidates, 72, {
      id: "self-evolution-review-queue",
      source: "self-evolution",
      title: "Review active self-evolution proposals",
      summary: `${activeProposals.length} proposal${activeProposals.length === 1 ? "" : "s"} awaiting decision or implementation follow-through.`,
      owner: topProposal.owner || "main",
      rationale: "Manual self-evolution is intentionally operator-reviewed; active proposals are leverage opportunities until resolved.",
      evidence: [`Top proposal: ${topProposal.title}`, `Latest run: ${state.selfEvolution.latestDate ?? "unknown"}`],
      href: state.selfEvolution.latestDate ? `/self-evolution/day/${encodeURIComponent(state.selfEvolution.latestDate)}` : "/self-evolution",
    });
  }

  const failedRuntimeTasks = state.runtimeTasks.filter((task) => ["failed", "error"].includes(normalizeStatus(task.status)));
  if (failedRuntimeTasks.length > 0) {
    const task = failedRuntimeTasks[0];
    pushOpsCandidate(candidates, 96, {
      id: `runtime-failed-${task.taskId}`,
      source: "runtime",
      title: "Inspect failed runtime task",
      summary: task.terminalSummary ?? task.label ?? task.taskId,
      owner: task.agentId ?? "runtime",
      rationale: "A failed background task can leave user-visible or maintenance work incomplete.",
      evidence: [`Status: ${task.status}`, `Task: ${task.taskId}`, task.terminalOutcome ? `Outcome: ${task.terminalOutcome}` : "Source: runtime_tasks"],
      href: "/ops",
    });
  }

  const blockedFlow = state.flows.find((flow) => ["blocked", "waiting", "failed"].includes(normalizeStatus(flow.status)) || Boolean(flow.blockedTaskId));
  if (blockedFlow) {
    pushOpsCandidate(candidates, 88, {
      id: `taskflow-blocked-${blockedFlow.flowId}`,
      source: "taskflow",
      title: "Resolve blocked TaskFlow",
      summary: blockedFlow.blockedSummary ?? blockedFlow.goal ?? blockedFlow.flowId,
      owner: blockedFlow.ownerKey ?? blockedFlow.controllerId ?? "taskflow",
      rationale: "Durable workflows are designed to wait explicitly; a blocked flow is often the next operational handoff.",
      evidence: [`Flow: ${blockedFlow.flowId}`, `Status: ${blockedFlow.status}`, blockedFlow.blockedTaskId ? `Blocked task: ${blockedFlow.blockedTaskId}` : "Source: task_flows"],
      href: "/ops",
    });
  }

  const failingCron = state.cronJobs.find((job) => job.enabled && ["failed", "error", "timeout"].includes(normalizeStatus(job.lastRunStatus)));
  if (failingCron) {
    pushOpsCandidate(candidates, 84, {
      id: `cron-failed-${failingCron.jobId}`,
      source: "cron",
      title: "Check failing cron job",
      summary: failingCron.name,
      owner: failingCron.agentId,
      rationale: "Enabled scheduled maintenance with a failed last run can silently degrade core operations.",
      evidence: [`Last status: ${failingCron.lastRunStatus ?? "unknown"}`, `Schedule: ${failingCron.scheduleLabel}`, `Job: ${failingCron.jobId}`],
      href: "/ops",
    });
  }

  const unhealthyMemory = state.memoryHealth.find((workspace) => normalizeStatus(workspace.status) !== "ok" || !workspace.qmdHealthy || !workspace.hasTodayDaily);
  if (unhealthyMemory) {
    pushOpsCandidate(candidates, 66, {
      id: `memory-health-${unhealthyMemory.workspaceId}`,
      source: "memory",
      title: "Review memory health gap",
      summary: `${unhealthyMemory.workspaceId}: ${unhealthyMemory.status}`,
      owner: unhealthyMemory.workspaceId,
      rationale: "Memory freshness and QMD health directly affect recall quality for agents and self-evolution evidence.",
      evidence: [`Today daily: ${unhealthyMemory.hasTodayDaily ? "yes" : "no"}`, `QMD: ${unhealthyMemory.qmdHealthy ? "ok" : unhealthyMemory.qmdMessage}`, `Path: ${unhealthyMemory.pathStatus}`],
      href: "/ops",
    });
  }

  const severeFinding = state.findings.find((finding) => ["critical", "high", "error"].includes(normalizeStatus(finding.severity)));
  if (severeFinding) {
    pushOpsCandidate(candidates, 82, {
      id: `audit-${severeFinding.findingId}`,
      source: "audit",
      title: "Triage audit finding",
      summary: severeFinding.detail,
      owner: severeFinding.kind,
      rationale: "High-severity audit findings should outrank routine dashboard scanning.",
      evidence: [`Severity: ${severeFinding.severity}`, `Code: ${severeFinding.code}`, `Kind: ${severeFinding.kind}`],
      href: "/ops",
    });
  }

  if (state.snapshot.routing.failures > 0 || state.snapshot.routing.pending > 0) {
    const failures = state.snapshot.routing.failures;
    pushOpsCandidate(candidates, failures > 0 ? 78 : 58, {
      id: "routing-attention",
      source: "routing",
      title: failures > 0 ? "Inspect routing failures" : "Review pending routing attempts",
      summary: `Failures: ${state.snapshot.routing.failures} · Pending: ${state.snapshot.routing.pending}`,
      owner: "main",
      rationale: "Routing issues can send work to the wrong owner or leave delegated work incomplete.",
      evidence: [`Total routing attempts: ${state.snapshot.routing.total}`, `Compliant: ${state.snapshot.routing.compliant}`],
      href: "/ops",
    });
  }

  if (candidates.length === 0) {
    return [
      {
        id: "ops-no-immediate-blocker",
        source: "system",
        priority: "low",
        title: "No obvious ops blocker",
        summary: "No failed runtime task, blocked flow, failing cron, high audit finding, or self-evolution blocker is visible in the current snapshot.",
        owner: "main",
        rationale: "This card is read-only and ranks only known local Mission Control state; refresh if the snapshot may be stale.",
        evidence: [`Snapshot generated: ${state.snapshot.generatedAt ?? "unknown"}`],
        href: null,
      },
    ];
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, limit)
    .map((candidate) => candidate.item);
}

function packetStatusText(status: string | null | undefined) {
  return status?.trim() || "review";
}

function openDb(): DatabaseSync | null {
  if (!fs.existsSync(MISSION_CONTROL_DB_PATH)) {
    return null;
  }
  return new DatabaseSync(MISSION_CONTROL_DB_PATH, { readOnly: true });
}

function queryRows<T>(db: DatabaseSync | null, sql: string): T[] {
  if (!db) {
    return [];
  }
  try {
    return db
      .prepare(sql)
      .all()
      .map((row) => ({ ...row })) as T[];
  } catch {
    return [];
  }
}

function hasColumn(db: DatabaseSync | null, table: string, column: string): boolean {
  if (!db) {
    return false;
  }
  try {
    const rows = db.prepare(`PRAGMA table_info(${table});`).all() as { name?: string }[];
    return rows.some((row) => row.name === column);
  } catch {
    return false;
  }
}

const DETAIL_REF_RE = /\[\[Tasks\/Details\/([^#\]]+)(?:#[^\]]+)?\]\]/;

function detailRefToPath(ref: string): string | null {
  if (!ref || ref === "none") {
    return null;
  }
  const match = ref.match(DETAIL_REF_RE);
  if (!match) {
    return null;
  }
  const stem = match[1].endsWith(".md") ? match[1] : `${match[1]}.md`;
  return path.join(TASKS_ROOT, "Details", stem);
}

function readDetailBody(detailPath: string | null) {
  if (!detailPath || !fs.existsSync(detailPath)) {
    return null;
  }
  try {
    return fs.readFileSync(detailPath, "utf8");
  } catch {
    return null;
  }
}

function readMarkdownFile(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}


const RETIRED_SELF_EVOLUTION_CRON_ID = "1f7cd9e2-ac47-4437-a3f1-f000ec1e50b6";
const MEMORY_SELF_EVOLUTION_ROOT = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Memory", "Self-Evolution");
const MANUAL_RUNS_DIR = path.join(MEMORY_SELF_EVOLUTION_ROOT, "Manual Runs");
const IMPLEMENTER_REPORTS_DIR = path.join(MEMORY_SELF_EVOLUTION_ROOT, "Implementer Reports");
const RETIRED_WIRING_DIR = path.join(MEMORY_SELF_EVOLUTION_ROOT, "Retired Wiring");
const RETIRED_CRON_MANIFEST = path.join(RETIRED_WIRING_DIR, "daily-supervised-self-evolution-review-cron-2026-06-22.json");
const MANUAL_GUIDANCE_INDEX = path.join(MEMORY_SELF_EVOLUTION_ROOT, "Dual-Entity Operating Contract.md");
const CANONICAL_PACKETS_DIR = MANUAL_RUNS_DIR;
const PACKET_ATTIC_DIR = path.join(RETIRED_WIRING_DIR, "Discarded Manual Proposals");

function slugifyPacketKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96) || "packet";
}

export function selfEvolutionPacketKey(packet: { dedupeKey?: string | null; title: string; id: string }) {
  return slugifyPacketKey(packet.dedupeKey || packet.title || packet.id);
}

function canonicalPacketPath(key: string) {
  return path.join(CANONICAL_PACKETS_DIR, `${slugifyPacketKey(key)}.md`);
}

function atticPacketPath(key: string) {
  return path.join(PACKET_ATTIC_DIR, `${slugifyPacketKey(key)}.md`);
}

function parsePacketFrontmatter(markdown: string | null): Record<string, string> {
  if (!markdown?.startsWith("---\n")) {
    return {};
  }
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) {
    return {};
  }
  const metadata: Record<string, string> = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (match) {
      metadata[match[1]] = match[2].replace(/^"|"$/gu, "").trim();
    }
  }
  return metadata;
}

function packetKeysFromImplementationText(text: string) {
  const keys = new Set<string>();
  for (const match of text.matchAll(/Canonical key:\s*([^\n]+)/giu)) {
    keys.add(slugifyPacketKey(match[1].trim()));
  }
  for (const match of text.matchAll(/Proposal ID:\s*([^\n]+)/giu)) {
    keys.add(slugifyPacketKey(match[1].trim()));
  }
  return keys;
}

function loadImplementationTaskStatusByPacketKey(db: DatabaseSync | null) {
  const rows = queryRows<{ id: string; title: string; status: string; detailsRef: string; rawJson: string }>(
    db,
    `
      SELECT id, title, status, details_ref as detailsRef, raw_json as rawJson
      FROM task_snapshots
      WHERE title LIKE 'Implement self-evolution proposal:%'
         OR raw_json LIKE '%self-evolution proposal%'
         OR raw_json LIKE '%dual-entity self-evolution%'
         OR raw_json LIKE '%Proposal ID:%'
      ORDER BY recorded_at DESC, created_on DESC, id DESC
      LIMIT 1000;
    `,
  );
  const byPacketKey = new Map<string, string>();
  for (const row of rows) {
    const detailBody = readDetailBody(detailRefToPath(row.detailsRef)) ?? "";
    const text = `${row.title}\n${row.rawJson}\n${detailBody}`;
    if (!/Implement self-evolution proposal:|Proposal ID:|Canonical key:/u.test(text)) {
      continue;
    }
    for (const key of packetKeysFromImplementationText(text)) {
      if (row.status === "done") {
        byPacketKey.set(key, "done");
      } else if (!byPacketKey.has(key)) {
        byPacketKey.set(key, row.status);
      }
    }
    const titleMatch = row.title.match(/^Implement self-evolution proposal:\s*(.+)$/u);
    if (titleMatch) {
      const titleKey = slugifyPacketKey(titleMatch[1]);
      if (row.status === "done") {
        byPacketKey.set(titleKey, "done");
      } else if (!byPacketKey.has(titleKey)) {
        byPacketKey.set(titleKey, row.status);
      }
    }
  }
  return byPacketKey;
}

function readCanonicalPacketDocument(key: string, fallback: DashboardSelfEvolutionLink | null) {
  const canonicalPath = canonicalPacketPath(key);
  if (fs.existsSync(canonicalPath)) {
    return selfEvolutionLink("Canonical packet", canonicalPath);
  }
  const atticPath = atticPacketPath(key);
  if (fs.existsSync(atticPath)) {
    return selfEvolutionLink("Canonical packet", atticPath);
  }
  return fallback;
}

function atticPacketKeys() {
  if (!fs.existsSync(PACKET_ATTIC_DIR)) {
    return new Set<string>();
  }
  const keys = new Set<string>();
  for (const name of fs.readdirSync(PACKET_ATTIC_DIR).filter((entry) => entry.endsWith(".md"))) {
    const filePath = path.join(PACKET_ATTIC_DIR, name);
    const metadata = parsePacketFrontmatter(readMarkdownFile(filePath));
    keys.add(slugifyPacketKey(metadata.dedupe_key || metadata.canonical_key || path.basename(name, ".md")));
  }
  return keys;
}

export function dedupeSelfEvolutionPackets(packets: DashboardSelfEvolutionPacket[], hiddenKeys = new Set<string>()) {
  const byKey = new Map<string, DashboardSelfEvolutionPacket>();
  const statusRank: Record<string, number> = { discarded: 5, done: 4, approved: 3, in_progress: 2, review: 1 };
  for (const packet of packets) {
    const key = selfEvolutionPacketKey(packet);
    if (hiddenKeys.has(key)) {
      continue;
    }
    const document = readCanonicalPacketDocument(key, packet.document);
    const metadata = parsePacketFrontmatter(document?.markdown ?? null);
    const inAttic = document?.path ? document.path.startsWith(PACKET_ATTIC_DIR) : false;
    const existing = byKey.get(key);
    const dates = [...new Set([...(existing?.dates ?? []), packet.date])].sort().reverse();
    const mergedStatus = [metadata.status, existing?.status, packet.status]
      .filter((status): status is string => Boolean(status))
      .sort((left, right) => (statusRank[right] ?? 0) - (statusRank[left] ?? 0))[0] ?? null;
    const merged: DashboardSelfEvolutionPacket = {
      ...(existing ?? packet),
      ...packet,
      date: dates[0] ?? packet.date,
      dates,
      canonicalKey: key,
      status: mergedStatus,
      dedupeKey: metadata.dedupe_key || packet.dedupeKey || existing?.dedupeKey || key,
      title: metadata.title || packet.title || existing?.title || packet.id,
      summary: packet.summary || existing?.summary || metadata.title || packet.title || packet.id,
      document,
      attic: inAttic,
    };
    byKey.set(key, merged);
  }
  return [...byKey.values()].sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title));
}

export function applySelfEvolutionImplementationTaskStatuses(packets: DashboardSelfEvolutionPacket[], implementationStatusByPacketKey: Map<string, string>) {
  return packets.map((packet) => {
    const implementationStatus = implementationStatusByPacketKey.get(packet.canonicalKey) ?? implementationStatusByPacketKey.get(slugifyPacketKey(packet.id)) ?? implementationStatusByPacketKey.get(slugifyPacketKey(packet.title));
    return implementationStatus === "done" ? { ...packet, status: "done" } : packet;
  });
}

function isOpenSelfEvolutionImprovement(packet: DashboardSelfEvolutionPacket) {
  const status = packet.status?.trim().toLowerCase() ?? "";
  return !packet.attic && status !== "discarded" && status !== "done";
}

function selfEvolutionEffortWeight(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (/^(0|none|trivial)$/u.test(normalized)) {
    return 0;
  }
  if (/^(1|low|small|minor|easy)$/u.test(normalized)) {
    return 1;
  }
  if (/^(3|high|large|major|hard|critical)$/u.test(normalized)) {
    return 3;
  }
  return 2;
}

function selfEvolutionPriorityScore(packet: Pick<DashboardSelfEvolutionPacket, "value" | "complexity" | "risk">) {
  const denominator = Math.max(1, selfEvolutionEffortWeight(packet.complexity) + selfEvolutionEffortWeight(packet.risk));
  return packet.value / denominator;
}

function sortSelfEvolutionByPriority(packets: DashboardSelfEvolutionPacket[]) {
  return [...packets].sort((left, right) => {
    const priority = selfEvolutionPriorityScore(right) - selfEvolutionPriorityScore(left);
    if (priority !== 0) {
      return priority;
    }
    if (right.value !== left.value) {
      return right.value - left.value;
    }
    return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
  });
}

function vaultRelative(filePath: string, keepSuffix = true): string {
  const rel = path.relative(OBSIDIAN_VAULT, filePath).split(path.sep).join("/");
  return !keepSuffix && rel.endsWith(".md") ? rel.slice(0, -3) : rel;
}

function titleFromMarkdown(markdown: string | null, fallbackPath: string) {
  const heading = markdown?.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (heading) {
    return heading;
  }
  return path.basename(fallbackPath, ".md");
}

function obsidianHref(filePath: string): string {
  const params = new URLSearchParams({
    vault: path.basename(OBSIDIAN_VAULT),
    file: vaultRelative(filePath, false),
  });
  return `obsidian://open?${params.toString()}`;
}

function selfEvolutionLink(label: string, filePath: string): DashboardSelfEvolutionLink {
  const markdown = readMarkdownFile(filePath);
  return {
    label,
    path: filePath,
    href: obsidianHref(filePath),
    exists: fs.existsSync(filePath),
    vaultPath: vaultRelative(filePath),
    title: titleFromMarkdown(markdown, filePath),
    markdown,
    sectionId: null,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractPacketSection(noteMarkdown: string | null, packetId: string) {
  if (!noteMarkdown) {
    return null;
  }
  const pattern = new RegExp(`^###\\s+${escapeRegExp(packetId)}\\b[^\\n]*\\n([\\s\\S]*?)(?=^###\\s+|^##\\s+|(?![\\s\\S]))`, "mu");
  const match = noteMarkdown.match(pattern);
  if (!match) {
    return null;
  }
  const heading = noteMarkdown.match(new RegExp(`^###\\s+${escapeRegExp(packetId)}\\b[^\\n]*`, "mu"))?.[0] ?? `### ${packetId}`;
  return `${heading}\n\n${match[1].trim()}`.trim();
}

function deriveSelfEvolutionComplexity(value: unknown, domain: string, summary: string) {
  const explicit = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (explicit === "low" || explicit === "medium" || explicit === "high") {
    return explicit;
  }
  const text = `${domain} ${summary}`.toLowerCase();
  if (/\b(cron|config|agent policy|durable behavior|broad workflow|systemic|big idea)\b/u.test(text)) {
    return "high";
  }
  if (/\b(mission control|mc ui|data workflow|task workflow|analyzer|qmd|task-board|runtime)\b/u.test(text)) {
    return "medium";
  }
  return "low";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function sourceNoteDocument(notePath: string, row: Record<string, unknown>, fallbackMarkdown: string) {
  const sourcePath = typeof row.source_note === "string" && row.source_note ? row.source_note : null;
  if (sourcePath && fs.existsSync(sourcePath)) {
    return selfEvolutionLink("Source evidence", sourcePath);
  }
  const rawMarkdown = typeof row.raw_markdown === "string" ? row.raw_markdown : fallbackMarkdown;
  return {
    label: "Source evidence",
    path: sourcePath ?? notePath,
    href: obsidianHref(sourcePath ?? notePath),
    exists: Boolean(rawMarkdown),
    vaultPath: sourcePath && sourcePath.startsWith(OBSIDIAN_VAULT) ? vaultRelative(sourcePath) : vaultRelative(notePath),
    title: "Source evidence",
    markdown: rawMarkdown,
    sectionId: typeof row.id === "string" ? row.id : null,
  } satisfies DashboardSelfEvolutionLink;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function clampSelfEvolutionValue(value: number) {
  return Math.max(1, Math.min(5, Math.round(value * 10) / 10));
}

function numericSelfEvolutionValue(item: Record<string, unknown>) {
  for (const key of ["value", "value_score", "impact_score", "priority_score", "expected_value"]) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return clampSelfEvolutionValue(value);
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return clampSelfEvolutionValue(Number(value));
    }
  }
  return null;
}

function deriveSelfEvolutionValue(item: Record<string, unknown>, domain: string, evidence: string[]) {
  const explicit = numericSelfEvolutionValue(item);
  if (explicit !== null) {
    return explicit;
  }

  const followup = asRecord(item.recommended_followup);
  const text = [
    domain,
    item.title,
    item.summary,
    item.proposed_change,
    item.proposed_behavior_change,
    item.expected_user_value,
    item.expected_benefit,
    item.user_impact,
    item.proposal_class,
    item.implementation_shape,
    followup.kind,
    followup.summary,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  let value = 2.5;
  if (["runtime_system", "mission_control_product", "leverage"].includes(domain)) {
    value += 0.5;
  }
  if (/\b(big_idea|workflow|system|runtime|cron|task|mission control|agent)\b/u.test(text)) {
    value += 0.5;
  }
  if (/\b(safer|safety|risk|stale|false confidence|blocked|missed blocker|fail early|validation|rollback|rework)\b/u.test(text)) {
    value += 0.75;
  }
  if (/\b(faster|lower cognitive load|file hunting|trustworthy|clearer|discoverability|evidence)\b/u.test(text)) {
    value += 0.5;
  }
  if (evidence.length >= 3) {
    value += 0.25;
  }
  return clampSelfEvolutionValue(value);
}

function manualRunJsonFiles(): string[] {
  if (!fs.existsSync(MANUAL_RUNS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MANUAL_RUNS_DIR)
    .filter((name) => name.endsWith(".json") && !name.endsWith("-implementer-review.json"))
    .map((name) => path.join(MANUAL_RUNS_DIR, name))
    .sort((left, right) => {
      const leftMtime = fs.statSync(left).mtimeMs;
      const rightMtime = fs.statSync(right).mtimeMs;
      return rightMtime - leftMtime || right.localeCompare(left);
    });
}

function readJsonFile(filePath: string | null): Record<string, unknown> {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function manualRunMarkdownPath(jsonPath: string) {
  return jsonPath.replace(/\.json$/u, ".md");
}

function implementerReviewSearchDirs() {
  return [...new Set([MANUAL_RUNS_DIR, IMPLEMENTER_REPORTS_DIR])];
}

function findImplementerReviewPath(runId: string) {
  const expected = `${slugifyPacketKey(runId)}-implementer-review.json`;
  for (const dir of implementerReviewSearchDirs()) {
    const direct = path.join(dir, expected);
    if (fs.existsSync(direct)) {
      return direct;
    }
  }
  for (const dir of implementerReviewSearchDirs()) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    const match = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith("-implementer-review.json"))
      .map((name) => path.join(dir, name))
      .find((filePath) => readJsonFile(filePath).run_id === runId);
    if (match) {
      return match;
    }
  }
  return null;
}

function proposalDecisionById(report: Record<string, unknown>) {
  const decisions = Array.isArray(report.decisions) ? report.decisions.map(asRecord) : [];
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const decision of decisions) {
    const id = firstString(decision.proposal_id);
    if (id) {
      entries.push([id, decision]);
    }
  }
  return new Map(entries);
}

function proposalAnswer(proposal: Record<string, unknown>) {
  const answers = Array.isArray(proposal.francesco_answers) ? proposal.francesco_answers.map(asRecord) : [];
  const latest = answers[answers.length - 1] ?? null;
  return {
    questionAnswer: firstString(latest?.answer) ?? null,
    durableRule: firstString(latest?.durable_rule) ?? null,
    answeredAt: firstString(latest?.answered_at) ?? null,
  };
}

export function selfEvolutionImplementationFeedbackStatus(proposal: Record<string, unknown>) {
  const feedback = asRecord(proposal.implementation_feedback);
  const decision = firstString(feedback.decision)?.trim().toLowerCase() ?? "";
  return decision === "implemented" || decision === "done" ? "done" : null;
}

function manualProposalRawMarkdown(proposal: Record<string, unknown>, decision: Record<string, unknown> | null, runId: string) {
  const lines = [`### ${firstString(proposal.proposal_id) ?? "unknown-proposal"} - ${firstString(proposal.title) ?? "Untitled proposal"}`, ""];
  const fields: Array<[string, unknown]> = [
    ["Run", runId],
    ["Proposal type", proposal.proposal_type],
    ["Approval boundary", proposal.approval_boundary],
    ["Summary", proposal.summary],
    ["User value", proposal.user_value],
    ["Capability hypothesis", proposal.capability_hypothesis],
    ["First MVV", proposal.first_minimum_valuable_version],
    ["Validation signal", proposal.validation_signal],
    ["Risk", proposal.risk],
    ["Rollback", proposal.rollback],
    ["Implementer decision", decision?.decision],
    ["Decision rationale", decision?.rationale],
    ["Generator feedback", decision?.generator_feedback],
  ];
  for (const [label, value] of fields) {
    if (typeof value === "string" && value.trim()) {
      lines.push(`- ${label}: ${value.trim()}`);
    }
  }
  const evidence = stringArray(proposal.evidence_refs);
  if (evidence.length > 0) {
    lines.push("", "Evidence refs:", ...evidence.map((ref) => `- ${ref}`));
  }
  const validation = stringArray(proposal.validation);
  if (validation.length > 0) {
    lines.push("", "Validation:", ...validation.map((step) => `- ${step}`));
  }
  const answer = proposalAnswer(proposal);
  if (answer.questionAnswer) {
    lines.push("", "Francesco answer:", `- Answered at: ${answer.answeredAt ?? "unknown"}`, `- Answer: ${answer.questionAnswer}`);
    if (answer.durableRule) {
      lines.push(`- Durable rule: ${answer.durableRule}`);
    }
  }
  return lines.join("\n");
}

function parseManualProposalRow(
  proposal: Record<string, unknown>,
  context: {
    runId: string;
    createdAt: string | null;
    note: DashboardSelfEvolutionLink;
    notePath: string;
    jsonPath: string;
    reportPath: string | null;
    decision: Record<string, unknown> | null;
  },
): DashboardSelfEvolutionPacket | null {
  const id = firstString(proposal.proposal_id);
  const title = firstString(proposal.title, proposal.summary);
  if (!id || !title) {
    return null;
  }
  const decision = context.decision;
  const answer = proposalAnswer(proposal);
  const evidence = stringArray(proposal.evidence_refs);
  const rawMarkdown = manualProposalRawMarkdown(proposal, decision, context.runId);
  const approvalBoundary = firstString(proposal.approval_boundary, "none");
  const approvalRequired = Boolean(decision?.approval_required) || Boolean(approvalBoundary && approvalBoundary !== "none" && !answer.questionAnswer);
  const status = selfEvolutionImplementationFeedbackStatus(proposal) ?? (answer.questionAnswer && approvalBoundary !== "none" ? "answered" : approvalRequired ? "blocked" : firstString(decision?.decision, "review"));
  const canonicalKey = selfEvolutionPacketKey({ id, title, dedupeKey: id });
  return {
    date: context.runId,
    dates: [context.runId],
    generatedAt: context.createdAt,
    id,
    title,
    summary: firstString(proposal.summary, title) ?? title,
    domain: firstString(proposal.proposal_type, "proposal") ?? "proposal",
    analyzer: "dual_entity_manual_run",
    owner: firstString(proposal.owner, "main") ?? "main",
    value: deriveSelfEvolutionValue({ ...proposal, value: proposal.value }, firstString(proposal.proposal_type, "proposal") ?? "proposal", evidence),
    risk: firstString(proposal.risk, "unknown") ?? "unknown",
    complexity: deriveSelfEvolutionComplexity(proposal.complexity, firstString(proposal.proposal_type, "proposal") ?? "proposal", firstString(proposal.summary, title) ?? title),
    status,
    dedupeKey: id,
    canonicalKey,
    approvalClassification: approvalBoundary,
    approvalClass: approvalBoundary,
    approvalBoundary,
    approvalRequired,
    userValue: firstString(proposal.user_value),
    capabilityHypothesis: firstString(proposal.capability_hypothesis),
    firstMinimumValuableVersion: firstString(proposal.first_minimum_valuable_version),
    validationSignal: firstString(proposal.validation_signal),
    riskOfNotBuilding: firstString(proposal.risk_of_not_building),
    decision: firstString(decision?.decision),
    decisionRationale: firstString(decision?.rationale),
    evidenceQuality: firstString(decision?.evidence_quality),
    generatorFeedback: firstString(decision?.generator_feedback),
    questionAnswer: answer.questionAnswer,
    durableRule: answer.durableRule,
    answeredAt: answer.answeredAt,
    manualRunJsonPath: context.jsonPath,
    implementerReportPath: context.reportPath,
    evidence,
    rollback: firstString(proposal.rollback),
    validation: stringArray(proposal.validation),
    sourceNote: context.jsonPath,
    note: context.note,
    reviewTask: null,
    document: sourceNoteDocument(context.notePath, { id, source_note: context.notePath, raw_markdown: rawMarkdown }, rawMarkdown),
    attic: false,
  };
}

function loadManualSelfEvolutionRuns(runtimeInvocationsByPacketKey: Map<string, DashboardRuntimeInvocation>, implementationStatusByPacketKey: Map<string, string>): DashboardSelfEvolutionRun[] {
  return manualRunJsonFiles().flatMap((jsonPath) => {
    const packet = readJsonFile(jsonPath);
    const runId = firstString(packet.run_id) ?? path.basename(jsonPath, ".json");
    const createdAt = firstString(packet.created_at);
    const notePath = fs.existsSync(manualRunMarkdownPath(jsonPath)) ? manualRunMarkdownPath(jsonPath) : jsonPath;
    const note = selfEvolutionLink(`Manual run · ${runId}`, notePath);
    const reportPath = findImplementerReviewPath(runId);
    const report = readJsonFile(reportPath);
    const decisions = proposalDecisionById(report);
    const proposals = Array.isArray(packet.proposals) ? packet.proposals.map(asRecord) : [];
    const packetErrors = stringArray(packet.packet_errors);
    const reportErrors = stringArray(report.errors);
    const parsedPackets = proposals
      .map((proposal) =>
        parseManualProposalRow(proposal, {
          runId,
          createdAt,
          note,
          notePath,
          jsonPath,
          reportPath,
          decision: decisions.get(firstString(proposal.proposal_id) ?? "") ?? null,
        }),
      )
      .filter((row): row is DashboardSelfEvolutionPacket => Boolean(row));
    return [
      {
        date: runId,
        generatedAt: createdAt,
        allGatesOk: packetErrors.length === 0 && (Object.keys(report).length === 0 || Boolean(report.packet_valid)),
        packetCount: parsedPackets.length,
        reviewTask: null,
        gates: [
          { name: "manual run packet valid", ok: packetErrors.length === 0 },
          { name: "implementer feedback available", ok: Boolean(reportPath) },
          { name: "implementer feedback valid", ok: reportErrors.length === 0 && (Object.keys(report).length === 0 || Boolean(report.packet_valid)) },
        ],
        mutatingActions: [],
        note,
        packets: sortSelfEvolutionByPriority(
          applySelfEvolutionImplementationTaskStatuses(
            parsedPackets.map((proposal) => ({
              ...proposal,
              runtimeInvocation: runtimeInvocationsByPacketKey.get(proposal.canonicalKey) ?? null,
            })),
            implementationStatusByPacketKey,
          ),
        ),
      } satisfies DashboardSelfEvolutionRun,
    ];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseRuntimeInvocationMetadata(value: unknown) {
  const metadata = asRecord(value);
  return {
    defaultAgentId: typeof metadata.defaultAgentId === "string" ? metadata.defaultAgentId : null,
    selectedAgentId: typeof metadata.selectedAgentId === "string" ? metadata.selectedAgentId : null,
    agentSelectionReason: typeof metadata.agentSelectionReason === "string" ? metadata.agentSelectionReason : null,
  };
}

function loadRuntimeInvocations(db: DatabaseSync | null) {
  return queryRows<{
    id: string;
    idempotencyKey: string;
    kind: string;
    title: string;
    agentId: string;
    status: string;
    mcObjectType: string | null;
    mcObjectId: string | null;
    obsidianTaskId: string | null;
    detailsPath: string | null;
    sessionKey: string | null;
    runId: string | null;
    runtimeTaskId: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
    terminalAt: string | null;
    metadataJson: string;
  }>(
    db,
    `
      SELECT id, idempotency_key as idempotencyKey, kind, title, agent_id as agentId, status,
             mc_object_type as mcObjectType, mc_object_id as mcObjectId,
             obsidian_task_id as obsidianTaskId, details_path as detailsPath,
             session_key as sessionKey, run_id as runId, runtime_task_id as runtimeTaskId,
             error, created_at as createdAt, updated_at as updatedAt, terminal_at as terminalAt,
             metadata_json as metadataJson
      FROM runtime_invocations
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 100;
    `,
  ).map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadataJson);
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      kind: row.kind,
      title: row.title,
      agentId: row.agentId,
      status: row.status,
      obsidianTaskId: row.obsidianTaskId,
      detailsPath: row.detailsPath,
      sessionKey: row.sessionKey,
      runId: row.runId,
      runtimeTaskId: row.runtimeTaskId,
      error: row.error,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      terminalAt: row.terminalAt,
      ...parseRuntimeInvocationMetadata(metadata),
      mcObjectType: row.mcObjectType,
      mcObjectId: row.mcObjectId,
    };
  });
}

function loadSelfEvolutionRuns(runtimeInvocationsByPacketKey: Map<string, DashboardRuntimeInvocation>, implementationStatusByPacketKey: Map<string, string>): DashboardSelfEvolutionRun[] {
  return loadManualSelfEvolutionRuns(runtimeInvocationsByPacketKey, implementationStatusByPacketKey);
}

function loadSelfEvolutionState(db: DatabaseSync | null): DashboardSelfEvolution {
  const runtimeInvocations = loadRuntimeInvocations(db);
  const implementationStatusByPacketKey = loadImplementationTaskStatusByPacketKey(db);
  const runtimeInvocationsByPacketKey = runtimeInvocations.reduce<Map<string, DashboardRuntimeInvocation>>((map, invocation) => {
    const packetKey =
      invocation.mcObjectType === "self-evolution-proposal" && invocation.mcObjectId
        ? invocation.mcObjectId
        : null;
    if (packetKey && !map.has(packetKey)) {
      map.set(packetKey, invocation);
    }
    return map;
  }, new Map());
  const runs = loadSelfEvolutionRuns(runtimeInvocationsByPacketKey, implementationStatusByPacketKey);
  const latestRun = runs[0] ?? null;
  const latestNotePath = latestRun?.note.path ?? null;
  const packets = sortSelfEvolutionByPriority(dedupeSelfEvolutionPackets(runs.flatMap((run) => run.packets), atticPacketKeys()).filter(isOpenSelfEvolutionImprovement));

  return {
    activeCronId: RETIRED_SELF_EVOLUTION_CRON_ID,
    reviewRoot: MEMORY_SELF_EVOLUTION_ROOT,
    reviewPacketsDir: MANUAL_RUNS_DIR,
    indexPath: MANUAL_GUIDANCE_INDEX,
    indexExists: fs.existsSync(MANUAL_GUIDANCE_INDEX),
    latestNotePath,
    latestNoteExists: Boolean(latestNotePath && fs.existsSync(latestNotePath)),
    latestGeneratedAt: latestRun?.generatedAt ?? null,
    latestDate: latestRun?.date ?? null,
    allGatesOk: latestRun?.allGatesOk ?? null,
    packetCount: packets.length,
    reviewTaskId: latestRun?.reviewTask?.id ?? null,
    reviewTaskStatus: latestRun?.reviewTask?.status ?? null,
    gates: latestRun?.gates ?? [],
    mutatingActions: latestRun?.mutatingActions ?? [],
    runs,
    packets,
    links: {
      index: selfEvolutionLink("Dual-entity contract", MANUAL_GUIDANCE_INDEX),
      latestNote: latestRun?.note ?? null,
      curriculum: selfEvolutionLink("Curriculum/backlog", path.join(MEMORY_SELF_EVOLUTION_ROOT, "Capability Curriculum and Backlog.md")),
      systemMap: selfEvolutionLink("System map", path.join(MEMORY_SELF_EVOLUTION_ROOT, "System Map.md")),
      valuesModel: selfEvolutionLink("Values model", path.join(MEMORY_SELF_EVOLUTION_ROOT, "Values Model.md")),
      evalCorpus: selfEvolutionLink("Evaluation corpus", path.join(MEMORY_SELF_EVOLUTION_ROOT, "Evaluation Corpus.md")),
    },
  };
}

export function loadDashboardState() {
  const snapshot = readJson<SnapshotRow>(SNAPSHOT_PATH, {
    generatedAt: null,
    tasks: { count: 0, flows: 0, findings: 0, inbox: 0, backlog: 0 },
    ingress: { total: 0, bySource: {} },
    routing: { total: 0, failures: 0, pending: 0, compliant: 0 },
  });
  const db = openDb();

  const tasks = queryRows<DashboardTask>(
    db,
    `
      SELECT id, title, board, status, owner, assignee_type as assigneeType, assignee,
             agent_status as agentStatus, created_on as createdOn, remind_on as remindOn,
             run_id as runId, flow_id as flowId, details_ref as detailsRef,
             results_ref as resultsRef, log_ref as logRef, checked, recorded_at as recordedAt, raw_json as rawJson
      FROM task_snapshots
      ORDER BY board ASC, created_on DESC, id DESC
      LIMIT 25;
    `,
  ).map((task) => {
    const detailsPath = detailRefToPath(task.detailsRef);
    const detailBody = readDetailBody(detailsPath);
    return {
      ...task,
      detailsPath,
      detailExists: Boolean(detailsPath && fs.existsSync(detailsPath)),
      detailBody,
    };
  });
  const terminalOutcomeSelect = hasColumn(db, "runtime_tasks", "terminal_outcome") ? "terminal_outcome" : "NULL";
  const runtimeTasks = queryRows<DashboardRuntimeTask>(
    db,
    `
      SELECT task_id as taskId, status, runtime, agent_id as agentId, label, owner_key as ownerKey, run_id as runId,
             created_at as createdAt, source_id as sourceId, delivery_status as deliveryStatus,
             terminal_summary as terminalSummary, ${terminalOutcomeSelect} as terminalOutcome,
             started_at as startedAt, ended_at as endedAt, last_event_at as lastEventAt, cleanup_after as cleanupAfter,
             COALESCE(last_event_at, ended_at, started_at, created_at) as activityAtMs,
             recorded_at as recordedAt, raw_json as rawJson
      FROM runtime_tasks
      ORDER BY activityAtMs DESC, created_at DESC
      LIMIT 25;
    `,
  );
  const flows = queryRows<Omit<DashboardFlow, "syncMode" | "controllerId">>(
    db,
    `
      SELECT flow_id as flowId, status, owner_key as ownerKey, goal, current_step as currentStep,
             blocked_task_id as blockedTaskId, blocked_summary as blockedSummary,
             created_at as createdAt, started_at as startedAt, ended_at as endedAt,
             last_event_at as lastEventAt, COALESCE(last_event_at, ended_at, started_at, created_at) as activityAtMs,
             recorded_at as recordedAt, raw_json as rawJson
      FROM task_flows
      ORDER BY activityAtMs DESC, recorded_at DESC
      LIMIT 25;
    `,
  ).map((flow) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(flow.rawJson);
    } catch {
      parsed = {};
    }
    return {
      ...flow,
      syncMode: typeof parsed.syncMode === "string" ? parsed.syncMode : null,
      controllerId: typeof parsed.controllerId === "string" ? parsed.controllerId : null,
    };
  });
  const events = queryRows<DashboardEvent>(
    db,
    `
      SELECT event_id as eventId, source, event_type as eventType, route_id as routeId, flow_id as flowId, status, payload_path as payloadPath, recorded_at as recordedAt
      FROM webhook_events
      ORDER BY recorded_at DESC
      LIMIT 25;
    `,
  );
  const findings = queryRows<DashboardFinding>(
    db,
    `
      SELECT finding_id as findingId, severity, code, kind, detail
      FROM audit_findings
      ORDER BY recorded_at DESC
      LIMIT 25;
    `,
  );
  const memoryHealth = queryRows<DashboardMemoryHealth>(
    db,
    `
      SELECT workspace_id as workspaceId, status, has_agents_md as hasAgentsMd, has_memory_md as hasMemoryMd,
             has_today_daily as hasTodayDaily, latest_daily as latestDaily, qmd_healthy as qmdHealthy,
             qmd_message as qmdMessage, raw_json as rawJson
      FROM memory_health
      ORDER BY status DESC, workspace_id ASC;
    `,
  ).map((workspace) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(workspace.rawJson);
    } catch {
      parsed = {};
    }
    return {
      ...workspace,
      memoryScope: typeof parsed.memoryScope === "string" ? parsed.memoryScope : "unknown",
      pathStatus: typeof parsed.pathStatus === "string" ? parsed.pathStatus : "unknown",
      pathMessage: typeof parsed.pathMessage === "string" ? parsed.pathMessage : "n/a",
      memoryDirPath: typeof parsed.memoryDirPath === "string" ? parsed.memoryDirPath : null,
      memoryFilePath: typeof parsed.memoryFilePath === "string" ? parsed.memoryFilePath : null,
      todayFilePath: typeof parsed.todayFilePath === "string" ? parsed.todayFilePath : null,
    };
  });
  const cronJobs = queryRows<DashboardCronJob>(
    db,
    `
      SELECT job_id as jobId, name, agent_id as agentId, enabled, schedule_label as scheduleLabel,
             last_run_status as lastRunStatus, last_run_at_ms as lastRunAtMs,
             next_run_at_ms as nextRunAtMs, last_duration_ms as lastDurationMs
      FROM cron_jobs
      ORDER BY enabled DESC, next_run_at_ms ASC, name ASC
      LIMIT 25;
    `,
  );
  const cronRuns = queryRows<DashboardCronRun>(
    db,
    `
      SELECT run_id as runId, job_id as jobId, ts, status, action, summary, delivery_status as deliveryStatus,
             session_id as sessionId, session_key as sessionKey, run_at_ms as runAtMs,
             duration_ms as durationMs, next_run_at_ms as nextRunAtMs, model, provider,
             recorded_at as recordedAt, raw_json as rawJson
      FROM cron_runs
      ORDER BY ts DESC
      LIMIT 25;
    `,
  );
  const routingAttempts = queryRows<DashboardRoutingAttempt>(
    db,
    `
      SELECT routing_id as routingId, recorded_at as recordedAt, source_agent as sourceAgent,
             source_session_id as sourceSessionId, source_message_id as sourceMessageId,
             request_group_key as requestGroupKey, request_excerpt as requestExcerpt,
             policy_domain as policyDomain, expected_target_agent as expectedTargetAgent,
             actual_target_agent as actualTargetAgent, mechanism, accepted,
             child_session_key as childSessionKey, child_session_id as childSessionId,
             run_id as runId, status, completion_summary as completionSummary,
             failure_mode as failureMode, recovery_mode as recoveryMode,
             compliance_status as complianceStatus, raw_json as rawJson
      FROM routing_attempts
      ORDER BY recorded_at DESC
      LIMIT 80;
    `,
  );

  const routingGroups = routingAttempts.reduce<Map<string, DashboardRoutingGroup>>((groups, attempt) => {
    const group =
      groups.get(attempt.requestGroupKey) ??
      ({
        requestGroupKey: attempt.requestGroupKey,
        requestExcerpt: attempt.requestExcerpt,
        sourceSessionId: attempt.sourceSessionId,
        latestRecordedAt: attempt.recordedAt,
        attempts: [],
      } satisfies DashboardRoutingGroup);
    group.latestRecordedAt = group.latestRecordedAt > attempt.recordedAt ? group.latestRecordedAt : attempt.recordedAt;
    group.attempts.push(attempt);
    groups.set(attempt.requestGroupKey, group);
    return groups;
  }, new Map());

  for (const group of routingGroups.values()) {
    group.attempts.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  const selfEvolution = loadSelfEvolutionState(db);
  db?.close();

  return {
    snapshot,
    tasks,
    runtimeTasks,
    flows,
    events,
    findings,
    memoryHealth,
    cronJobs,
    cronRuns,
    routingAttempts,
    routingGroups: [...routingGroups.values()].sort((left, right) => right.latestRecordedAt.localeCompare(left.latestRecordedAt)),
    selfEvolution,
    roots: {
      openclawHome: OPENCLAW_HOME,
      tasksRoot: TASKS_ROOT,
      stateDir: MISSION_CONTROL_STATE_DIR,
      dbPath: MISSION_CONTROL_DB_PATH,
    },
  };
}
