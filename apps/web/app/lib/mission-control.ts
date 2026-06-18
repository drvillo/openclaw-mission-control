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

type SnapshotRow = {
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

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
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


const ACTIVE_SELF_EVOLUTION_CRON_ID = "1f7cd9e2-ac47-4437-a3f1-f000ec1e50b6";
const SELF_EVOLUTION_DOCS_ROOT = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Self-Evolution");
const REVIEW_PACKETS_DIR = path.join(SELF_EVOLUTION_DOCS_ROOT, "Review Packets");
const REVIEW_PACKETS_INDEX = path.join(REVIEW_PACKETS_DIR, "Index.md");
const CANONICAL_PACKETS_DIR = path.join(REVIEW_PACKETS_DIR, "Packets");
const PACKET_ATTIC_DIR = path.join(REVIEW_PACKETS_DIR, "Attic");
const MEMORY_SELF_EVOLUTION_ROOT = path.join(OBSIDIAN_VAULT, "System", "OpenClaw Memory", "Self-Evolution");

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
  for (const packetId of text.matchAll(/SE-REVIEW-\d+/gu)) {
    keys.add(slugifyPacketKey(packetId[0]));
  }
  for (const match of text.matchAll(/Canonical key:\s*([^\n]+)/giu)) {
    keys.add(slugifyPacketKey(match[1].trim()));
  }
  for (const match of text.matchAll(/SE-REVIEW-\d+\s*\/\s*([A-Za-z0-9:_-]+)/gu)) {
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
      WHERE title LIKE 'Implement self-evolution packet:%'
         OR title LIKE 'Implement self-evolution improvement:%'
         OR title LIKE 'Implement SE-REVIEW-%'
         OR raw_json LIKE '%self-evolution packet%'
         OR raw_json LIKE '%self-evolution improvement%'
         OR raw_json LIKE '%SE-REVIEW-%'
      ORDER BY recorded_at DESC, created_on DESC, id DESC
      LIMIT 1000;
    `,
  );
  const byPacketKey = new Map<string, string>();
  for (const row of rows) {
    const detailBody = readDetailBody(detailRefToPath(row.detailsRef)) ?? "";
    const text = `${row.title}\n${row.rawJson}\n${detailBody}`;
    if (!/Implement (?:self-evolution (?:packet|improvement)|SE-REVIEW-)|Packet ID:\s*SE-REVIEW-|Improvement ID:|Canonical key:/u.test(text)) {
      continue;
    }
    for (const key of packetKeysFromImplementationText(text)) {
      if (row.status === "done") {
        byPacketKey.set(key, "done");
      } else if (!byPacketKey.has(key)) {
        byPacketKey.set(key, row.status);
      }
    }
    const titleMatch = row.title.match(/^Implement self-evolution packet:\s*(.+)$/u);
    if (titleMatch) {
      const titleKey = slugifyPacketKey(titleMatch[1]);
      if (row.status === "done") {
        byPacketKey.set(titleKey, "done");
      } else if (!byPacketKey.has(titleKey)) {
        byPacketKey.set(titleKey, row.status);
      }
    }
    const improvementTitleMatch = row.title.match(/^Implement self-evolution improvement:\s*(.+)$/u);
    if (improvementTitleMatch) {
      const titleKey = slugifyPacketKey(improvementTitleMatch[1]);
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
  return !packet.attic && !packet.id.startsWith("SE-REVIEW-") && status !== "discarded" && status !== "done";
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

function packetDocument(label: string, notePath: string | null, noteMarkdown: string | null, packetId: string): DashboardSelfEvolutionLink | null {
  if (!notePath) {
    return null;
  }
  const markdown = extractPacketSection(noteMarkdown, packetId);
  return {
    label,
    path: notePath,
    href: obsidianHref(notePath),
    exists: Boolean(markdown),
    vaultPath: vaultRelative(notePath),
    title: label,
    markdown,
    sectionId: packetId,
  };
}

const SELF_EVOLUTION_DOMAINS = new Set(["knowledge", "interaction", "subagent_quality", "mission_control_product", "leverage", "runtime_system"]);

function normalizeSelfEvolutionDomain(value: unknown, analyzer: string | null) {
  const raw = typeof value === "string" ? value : analyzer ?? "";
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/gu, "_");
  if (SELF_EVOLUTION_DOMAINS.has(normalized)) {
    return normalized;
  }
  if (normalized.includes("knowledge")) {
    return "knowledge";
  }
  if (normalized.includes("interaction")) {
    return "interaction";
  }
  if (normalized.includes("subagent")) {
    return "subagent_quality";
  }
  if (normalized.includes("mission_control") || normalized.includes("product")) {
    return "mission_control_product";
  }
  if (normalized.includes("leverage") || normalized.includes("big_idea") || normalized.includes("small_fix")) {
    return "leverage";
  }
  return "runtime_system";
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

const EXPANDED_CATEGORY_COLLECTIONS: Record<string, { json: string; collection: string }> = {
  knowledge: { json: "knowledge_quality_review.json", collection: "knowledge_quality_findings" },
  interaction: { json: "interaction_patterns_review.json", collection: "interaction_pattern_hypotheses" },
  subagent_quality: { json: "subagent_quality_scorecards.json", collection: "subagent_quality_scorecards" },
  mission_control_product: { json: "mission_control_product_review.json", collection: "mission_control_product_opportunities" },
  leverage: { json: "big_ideas_and_small_fixes.json", collection: "big_idea_small_fix_proposals" },
};

function sourceObservationRefs(item: Record<string, unknown>, limit = 3) {
  const refs: string[] = [];
  for (const observation of Array.isArray(item.source_observations) ? item.source_observations : []) {
    const row = asRecord(observation);
    const ref = typeof row.source_ref === "string" ? row.source_ref : typeof row.observation_id === "string" ? row.observation_id : null;
    if (ref && !refs.includes(ref)) {
      refs.push(ref);
    }
    if (refs.length >= limit) {
      break;
    }
  }
  return refs;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function expandedAnalyzerTitle(domain: string, item: Record<string, unknown>) {
  return (
    firstString(
      item.title,
      item.summary,
      item.hypothesis,
      item.observed_issue,
      item.proposed_change,
      item.proposed_behavior_change,
      asRecord(item.recommended_followup).summary,
      item.expected_user_value,
    ) ?? `${domain} improvement`
  );
}

function expandedAnalyzerRawMarkdown(domain: string, item: Record<string, unknown>, title: string) {
  const lines = [`### ${typeof item.id === "string" ? item.id : "unknown"} - ${title}`, ""];
  const fields: Array<[string, unknown]> = [
    ["Analyzer", item.analyzer],
    ["Domain", domain],
    ["Owner", item.owner ?? item.proposed_owner],
    ["Risk", item.risk],
    ["Approval", item.approval_class ?? item.decision_needed],
    ["Status", item.status],
    ["Summary", item.summary],
    ["Observed issue", item.observed_issue],
    ["Hypothesis", item.hypothesis],
    ["Proposed change", item.proposed_change ?? item.proposed_behavior_change],
    ["Recommended follow-up", asRecord(item.recommended_followup).summary],
    ["Expected user value", item.expected_user_value],
    ["Expected benefit", item.expected_benefit],
    ["Proposal class", item.proposal_class],
    ["Implementation shape", item.implementation_shape ?? item.proposed_solution_shape],
    ["Rollback", item.rollback ?? item.mutation_boundary],
  ];
  for (const [label, value] of fields) {
    if (typeof value === "string" && value.trim()) {
      lines.push(`- ${label}: ${value.trim()}`);
    } else if (Array.isArray(value) && value.length > 0) {
      lines.push(`- ${label}: ${value.map(String).join("; ")}`);
    }
  }
  const evidence = sourceObservationRefs(item, 8);
  if (evidence.length > 0) {
    lines.push("", "Evidence refs:", ...evidence.map((ref) => `- ${ref}`));
  }
  const validation = stringArray(item.validation);
  if (validation.length > 0) {
    lines.push("", "Validation:", ...validation.map((step) => `- ${step}`));
  }
  return lines.join("\n");
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

function parseExpandedAnalyzerItem(
  category: Record<string, unknown>,
  item: Record<string, unknown>,
  {
    date,
    generatedAt,
    note,
    notePath,
    reviewTask,
  }: {
    date: string;
    generatedAt: string | null;
    note: DashboardSelfEvolutionLink;
    notePath: string;
    reviewTask: DashboardSelfEvolutionReviewTask | null;
  },
) {
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;
  if (!id) {
    return null;
  }
  const domain = normalizeSelfEvolutionDomain(category.key, typeof item.analyzer === "string" ? item.analyzer : null);
  const title = expandedAnalyzerTitle(domain, item);
  const summary = firstString(item.summary, item.observed_issue, item.hypothesis, item.expected_user_value, title) ?? title;
  const sourceNote = firstString(category.markdown_path, category.json_path, note.path);
  const normalizedStatus = firstString(item.status);
  const evidence = sourceObservationRefs(item);
  return parseSelfEvolutionImprovementRow(
    {
      id,
      title,
      summary,
      domain,
      analyzer: firstString(item.analyzer, category.key),
      owner: firstString(item.owner, item.proposed_owner, "main"),
      risk: firstString(item.risk, "unknown"),
      complexity: item.complexity,
      approval_class: firstString(item.approval_class, item.decision_needed, "main_review"),
      status: normalizedStatus === "done" || normalizedStatus === "discarded" || normalizedStatus === "approved" ? normalizedStatus : "review",
      dedupe_key: id,
      evidence,
      value: deriveSelfEvolutionValue(item, domain, evidence),
      rollback: firstString(item.rollback, item.mutation_boundary),
      validation: stringArray(item.validation),
      source_note: sourceNote,
      raw_markdown: expandedAnalyzerRawMarkdown(domain, item, title),
    },
    { date, generatedAt, note, notePath, reviewTask },
  );
}

function expandedCategoryJsonPath(category: Record<string, unknown>) {
  const explicit = firstString(category.json_path);
  if (explicit) {
    return explicit;
  }
  const key = firstString(category.key);
  const markdownPath = firstString(category.markdown_path);
  const spec = key ? EXPANDED_CATEGORY_COLLECTIONS[key] : null;
  if (!spec) {
    return null;
  }
  if (markdownPath) {
    return path.join(path.dirname(markdownPath), spec.json);
  }
  return null;
}

function parseExpandedAnalyzerRows(
  metadata: Record<string, unknown>,
  context: {
    date: string;
    generatedAt: string | null;
    note: DashboardSelfEvolutionLink;
    notePath: string;
    reviewTask: DashboardSelfEvolutionReviewTask | null;
  },
) {
  const expandedReview = asRecord(metadata.expanded_review);
  const categories = Array.isArray(expandedReview.categories) ? expandedReview.categories.map(asRecord) : [];
  const packets: DashboardSelfEvolutionPacket[] = [];
  for (const category of categories) {
    const key = firstString(category.key);
    const spec = key ? EXPANDED_CATEGORY_COLLECTIONS[key] : null;
    const jsonPath = expandedCategoryJsonPath(category);
    if (!spec || !jsonPath || !fs.existsSync(jsonPath)) {
      continue;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const collection = parsed[spec.collection];
    const rows: unknown[] = Array.isArray(collection) ? collection : [];
    for (const row of rows) {
      const packet = parseExpandedAnalyzerItem({ ...category, json_path: jsonPath }, asRecord(row), context);
      if (packet) {
        packets.push(packet);
      }
    }
  }
  return packets;
}

function parseSelfEvolutionImprovementRow(
  row: unknown,
  {
    date,
    generatedAt,
    note,
    notePath,
    reviewTask,
  }: {
    date: string;
    generatedAt: string | null;
    note: DashboardSelfEvolutionLink;
    notePath: string;
    reviewTask: DashboardSelfEvolutionReviewTask | null;
  },
): DashboardSelfEvolutionPacket | null {
  const improvement = asRecord(row);
  const id = typeof improvement.id === "string" && improvement.id.trim() ? improvement.id : null;
  const title = typeof improvement.title === "string" && improvement.title.trim() ? improvement.title : typeof improvement.summary === "string" ? improvement.summary : null;
  if (!id || !title) {
    return null;
  }
  const analyzer = typeof improvement.analyzer === "string" ? improvement.analyzer : null;
  const domain = normalizeSelfEvolutionDomain(improvement.domain, analyzer);
  const summary = typeof improvement.summary === "string" && improvement.summary.trim() ? improvement.summary : title;
  const dedupeKey = typeof improvement.dedupe_key === "string" ? improvement.dedupe_key : typeof improvement.canonical_key === "string" ? improvement.canonical_key : id;
  const canonicalKey = selfEvolutionPacketKey({ id, title, dedupeKey });
  const approvalClass = typeof improvement.approval_class === "string" ? improvement.approval_class : typeof improvement.approval_classification === "string" ? improvement.approval_classification : null;
  const evidence = stringArray(improvement.evidence);
  const rawMarkdown =
    typeof improvement.raw_markdown === "string" && improvement.raw_markdown.trim()
      ? improvement.raw_markdown
      : `### ${id} - ${title}\n\n${summary}`;

  return {
    date,
    dates: [date],
    generatedAt,
    id,
    title,
    summary,
    domain,
    analyzer,
    owner: typeof improvement.owner === "string" && improvement.owner.trim() ? improvement.owner : "main",
    value: deriveSelfEvolutionValue(improvement, domain, evidence),
    risk: typeof improvement.risk === "string" && improvement.risk.trim() ? improvement.risk : "unknown",
    complexity: deriveSelfEvolutionComplexity(improvement.complexity, domain, summary),
    status: typeof improvement.status === "string" ? improvement.status : "review",
    dedupeKey,
    canonicalKey,
    approvalClassification: approvalClass,
    approvalClass,
    evidence,
    rollback: typeof improvement.rollback === "string" ? improvement.rollback : null,
    validation: stringArray(improvement.validation),
    sourceNote: typeof improvement.source_note === "string" ? improvement.source_note : note.path,
    note,
    reviewTask,
    document: readCanonicalPacketDocument(canonicalKey, sourceNoteDocument(notePath, improvement, rawMarkdown)),
    attic: false,
  };
}

function parseLegacyReviewPacketRow(
  row: unknown,
  notePath: string,
  noteMarkdown: string | null,
  date: string,
  generatedAt: string | null,
  note: DashboardSelfEvolutionLink,
  reviewTask: DashboardSelfEvolutionReviewTask | null,
) {
  const packet = asRecord(row);
  const id = typeof packet.id === "string" ? packet.id : "unknown";
  const title = typeof packet.title === "string" ? packet.title : "Untitled packet";
  const dedupeKey = typeof packet.dedupe_key === "string" ? packet.dedupe_key : null;
  const canonicalKey = selfEvolutionPacketKey({ id, title, dedupeKey });
  const legacyDocument = packetDocument(`${id} · ${title}`, notePath, noteMarkdown, id);
  const approvalClass = typeof packet.approval_classification === "string" ? packet.approval_classification : null;
  return {
    date,
    dates: [date],
    generatedAt,
    id,
    title,
    summary: title,
    domain: "runtime_system",
    analyzer: "legacy_review_packets",
    owner: "main",
    value: deriveSelfEvolutionValue(packet, "runtime_system", []),
    risk: "unknown",
    complexity: deriveSelfEvolutionComplexity(null, "runtime_system", title),
    status: typeof packet.status === "string" ? packet.status : null,
    dedupeKey,
    canonicalKey,
    approvalClassification: approvalClass,
    approvalClass,
    evidence: [],
    rollback: null,
    validation: [],
    sourceNote: note.path,
    note,
    reviewTask,
    document: readCanonicalPacketDocument(canonicalKey, legacyDocument),
    attic: false,
  } satisfies DashboardSelfEvolutionPacket;
}

function reviewPacketNotes(): string[] {
  if (!fs.existsSync(REVIEW_PACKETS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(REVIEW_PACKETS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .reverse()
    .map((name) => path.join(REVIEW_PACKETS_DIR, name));
}

function parseSelfEvolutionMetadata(notePath: string | null): Record<string, unknown> {
  if (!notePath || !fs.existsSync(notePath)) {
    return {};
  }
  try {
    const text = fs.readFileSync(notePath, "utf8");
    const match = text.match(/<!-- openclaw:self-evolution-run\n([\s\S]*?)\n-->/);
    if (!match) {
      return {};
    }
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseReviewTask(value: unknown): DashboardSelfEvolutionReviewTask | null {
  const reviewTask = asRecord(value);
  const id = typeof reviewTask.id === "string" && reviewTask.id !== "none" ? reviewTask.id : null;
  if (!id) {
    return null;
  }
  return {
    id,
    title: typeof reviewTask.title === "string" ? reviewTask.title : null,
    status: typeof reviewTask.status === "string" ? reviewTask.status : null,
    detailsRef: typeof reviewTask.details_ref === "string" ? reviewTask.details_ref : null,
    resultsRef: typeof reviewTask.results_ref === "string" ? reviewTask.results_ref : null,
    wikiRef: typeof reviewTask.wiki_ref === "string" ? reviewTask.wiki_ref : null,
  };
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
  return reviewPacketNotes().flatMap((notePath) => {
    const noteMarkdown = readMarkdownFile(notePath);
    const metadata = parseSelfEvolutionMetadata(notePath);
    const gates = asRecord(metadata.gates);
    const reviewTask = parseReviewTask(metadata.review_task);
    const improvementRows = Array.isArray(metadata.improvements) ? metadata.improvements : [];
    const packetRows = Array.isArray(metadata.review_packets) ? metadata.review_packets : [];
    const actionRows = Array.isArray(metadata.mutating_actions) ? metadata.mutating_actions : [];
    const date = typeof metadata.date === "string" ? metadata.date : path.basename(notePath, ".md");
    const note = selfEvolutionLink(`Self-Evolution · ${date}`, notePath);
    const generatedAt = typeof metadata.generated_at === "string" ? metadata.generated_at : null;
    const expandedPackets =
      improvementRows.length === 0
        ? parseExpandedAnalyzerRows(metadata, {
            date,
            generatedAt,
            note,
            notePath,
            reviewTask,
          })
        : [];
    const parsedPackets =
      improvementRows.length > 0
        ? improvementRows
            .map((row) =>
              parseSelfEvolutionImprovementRow(row, {
                date,
                generatedAt,
                note,
                notePath,
                reviewTask,
              }),
            )
            .filter((packet): packet is DashboardSelfEvolutionPacket => Boolean(packet))
        : expandedPackets.length > 0
          ? expandedPackets
          : packetRows.map((row) => parseLegacyReviewPacketRow(row, notePath, noteMarkdown, date, generatedAt, note, reviewTask));

    return [
      {
        date,
        generatedAt,
        allGatesOk: typeof metadata.all_gates_ok === "boolean" ? metadata.all_gates_ok : null,
        packetCount:
          typeof metadata.improvement_count === "number" && metadata.improvement_count > 0
            ? metadata.improvement_count
            : parsedPackets.length,
        reviewTask,
        gates: Object.entries(gates).map(([name, ok]) => ({ name, ok: Boolean(ok) })),
        mutatingActions: actionRows.map((row) => {
          const action = asRecord(row);
          return {
            kind: typeof action.kind === "string" ? action.kind : "unknown",
            target: typeof action.target === "string" ? action.target : "unknown",
          };
        }),
        note,
        packets: sortSelfEvolutionByPriority(
          applySelfEvolutionImplementationTaskStatuses(
            parsedPackets.map((packet) => ({
              ...packet,
              runtimeInvocation: runtimeInvocationsByPacketKey.get(packet.canonicalKey) ?? null,
            })),
            implementationStatusByPacketKey,
          ),
        ),
      } satisfies DashboardSelfEvolutionRun,
    ];
  });
}

function loadSelfEvolutionState(db: DatabaseSync | null): DashboardSelfEvolution {
  const runtimeInvocations = loadRuntimeInvocations(db);
  const implementationStatusByPacketKey = loadImplementationTaskStatusByPacketKey(db);
  const runtimeInvocationsByPacketKey = runtimeInvocations.reduce<Map<string, DashboardRuntimeInvocation>>((map, invocation) => {
    const packetKey =
      (invocation.mcObjectType === "self-evolution-improvement" || invocation.mcObjectType === "self-evolution-packet") && invocation.mcObjectId
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
    activeCronId: ACTIVE_SELF_EVOLUTION_CRON_ID,
    reviewRoot: SELF_EVOLUTION_DOCS_ROOT,
    reviewPacketsDir: REVIEW_PACKETS_DIR,
    indexPath: REVIEW_PACKETS_INDEX,
    indexExists: fs.existsSync(REVIEW_PACKETS_INDEX),
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
      index: selfEvolutionLink("Review index", REVIEW_PACKETS_INDEX),
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
