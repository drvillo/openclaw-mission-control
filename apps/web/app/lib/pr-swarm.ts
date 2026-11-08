import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE_ROOT = "/Users/fonkey-oc/.openclaw/workspace/.state/pr-swarm";
const DEFAULT_CONFIG_PATH = "/Users/fonkey-oc/.openclaw/workspace/config/pr-swarm.repos.json";

export type PrSwarmRepoConfigSummary = {
  repo: string;
  enabled: boolean;
  externalWriteMode: string;
  safetyMode: string;
  repoKillSwitch: boolean;
  approvalEnabled: boolean;
  requestChangesEnabled: boolean;
  automergeEnabled: boolean;
  approvalRequirements: Record<string, unknown>;
  automerge: Record<string, unknown>;
  triggers: Record<string, unknown>;
  githubActionEnabled: boolean;
  acceptedActions: string[];
  baseBranches: string[];
  headBranches: string[];
  pollingEnabled: boolean;
  autofixMode: string;
  autofixAllowedClasses: string[];
  autofixTargetMode: string;
  blockedPaths: string[];
  skipLabels: string[];
  reviewLenses: unknown[];
  notificationsTelegramEnabled: boolean;
  validationErrors: string[];
};

export type PrSwarmFixabilitySummary = {
  findingId: string;
  policy: string;
  reason: string;
  allowedClasses: string[];
  maxFiles: number;
  maxLines: number;
  targetMode: string;
};

export type PrSwarmTimelineItem = {
  step: string;
  status: string;
  path: string;
  reason?: string;
};

export type PrSwarmRunSummary = {
  runId: string;
  status: string;
  repo: string;
  prNumber: number;
  prUrl: string;
  source: string;
  eventAction: string | null;
  workflowRunId: string | null;
  workflowRunAttempt: string | null;
  bridgeEventId: string | null;
  dedupeKey: string;
  telegramNotificationSent: boolean;
  headSha: string;
  configHash: string;
  policyAction: string;
  policyReason: string;
  hardBlocks: string[];
  publisherStatus: string;
  publisherUrl: string | null;
  reviewRisk: string | null;
  securityRisk: string | null;
  judgeRisk: string | null;
  humanReviewRequired: boolean;
  idempotencyKey: string;
  artifactsDir: string;
  updatedAtMs: number | null;
  taskId: string | null;
  timeline: PrSwarmTimelineItem[];
  fixability: PrSwarmFixabilitySummary[];
  canGeneratePatch: boolean;
  canRequestHumanApprovedFix: boolean;
  canRereview: boolean;
  canAutonomousFix: boolean;
  dangerousControlsVisible: boolean;
  eligibilityEvidence: Record<string, unknown>;
  rollback: Record<string, unknown> | null;
  latestFixAttempt: Record<string, unknown> | null;
  normalized?: boolean;
  flowId?: string | null;
  finalStatus?: string | null;
  finalReason?: string | null;
  finalSha?: string | null;
  settledAt?: string | null;
  notificationDelivery?: Record<string, unknown>;
};

export type PrSwarmBridgeEventSummary = {
  eventId: string;
  repo: string;
  status: string;
  recordedAtMs: number | null;
  action: string | null;
  prUrl: string | null;
  headSha: string | null;
  dedupeKey: string | null;
  githubRunId: string | null;
  githubRunAttempt: string | null;
  failureReason: string | null;
};

export type PrSwarmBridgeHealthSummary = {
  lastEventAtMs: number | null;
  accepted: number;
  ignoredOrBlocked: number;
  failed: number;
  tokenFailures: number;
  schemaFailures: number;
  stale: boolean;
};

export type PrSwarmDashboardState = {
  configPath: string;
  stateRoot: string;
  globalSafetyMode: string;
  liveWritesEnabled: boolean;
  globalAutonomousEnabled: boolean;
  githubAuthHealth: "configured" | "not_checked";
  repos: PrSwarmRepoConfigSummary[];
  runs: PrSwarmRunSummary[];
  bridgeEvents: PrSwarmBridgeEventSummary[];
  bridgeHealth: PrSwarmBridgeHealthSummary;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(stripJsonComments(fs.readFileSync(filePath, "utf8"))) as T;
  } catch {
    return fallback;
  }
}

function stripJsonComments(input: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function walkFiles(root: string, fileName: string, limit = 50): string[] {
  const found: string[] = [];
  function walk(dir: string) {
    if (found.length >= limit || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === fileName) found.push(full);
      if (found.length >= limit) break;
    }
  }
  walk(root);
  return found;
}

export function loadPrSwarmState(options: { stateRoot?: string; configPath?: string } = {}): PrSwarmDashboardState {
  const stateRoot = options.stateRoot ?? DEFAULT_STATE_ROOT;
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const config = readJson<Record<string, any>>(configPath, { global: {}, repos: {} });
  const repos = Object.entries(config.repos ?? {}).map(([repo, raw]) => {
    const item = raw as Record<string, any>;
    const githubAction = typeof item.triggers?.githubAction === "object" && item.triggers.githubAction ? item.triggers.githubAction as Record<string, any> : {};
    const polling = typeof item.triggers?.polling === "object" && item.triggers.polling ? item.triggers.polling as Record<string, any> : {};
    const externalWriteMode = String(item.externalWriteMode ?? "disabled");
    const autofixMode = String(item.autofix?.mode ?? "disabled");
    const validationErrors = [
      ...(!["disabled", "comment_only", "review_actions"].includes(externalWriteMode) ? ["write mode must be disabled, comment_only, or review_actions"] : []),
      ...(!["disabled", "dry_run", "human_approved", "autonomous"].includes(autofixMode) ? ["autofix mode must be disabled, dry_run, human_approved, or autonomous"] : []),
      ...(Boolean(item.automergeEnabled) && !Boolean(item.approvalEnabled) ? ["automerge requires approval enabled"] : []),
    ];
    return {
      repo,
      enabled: Boolean(item.enabled),
      externalWriteMode,
      safetyMode: String(item.safetyMode ?? config.global?.safetyMode ?? "normal"),
      repoKillSwitch: Boolean(item.repoKillSwitch),
      approvalEnabled: Boolean(item.approvalEnabled),
      requestChangesEnabled: Boolean(item.requestChangesEnabled),
      automergeEnabled: Boolean(item.automergeEnabled),
      approvalRequirements: (item.approvalRequirements ?? {}) as Record<string, unknown>,
      automerge: (item.automerge ?? {}) as Record<string, unknown>,
      triggers: (item.triggers ?? {}) as Record<string, unknown>,
      githubActionEnabled: Boolean(githubAction.enabled),
      acceptedActions: asStringArray(githubAction.acceptedActions),
      baseBranches: asStringArray(githubAction.baseBranches),
      headBranches: asStringArray(githubAction.headBranches),
      pollingEnabled: Boolean(polling.enabled),
      autofixMode,
      autofixAllowedClasses: asStringArray(item.autofix?.allowedClasses),
      autofixTargetMode: String(item.autofix?.targetMode ?? "none"),
      blockedPaths: asStringArray(item.blockedPaths),
      skipLabels: asStringArray(item.skipLabels),
      reviewLenses: Array.isArray(item.reviewLenses) ? item.reviewLenses : [],
      notificationsTelegramEnabled: Boolean(item.notifications?.telegram?.enabled ?? config.global?.notifications?.telegram?.enabled),
      validationErrors,
    } satisfies PrSwarmRepoConfigSummary;
  });

  const executions = (fs.existsSync(path.join(stateRoot, "executions")) ? collectJsonFiles(path.join(stateRoot, "executions"), 100) : [])
    .map((filePath) => readJson<Record<string, any>>(filePath, {}))
    .filter((item) => Boolean(item.flowId && item.pr));
  const executionArtifactDirs = new Set(executions.flatMap((execution) => [
    ...((execution.attempts ?? []).map((attempt: any) => String(attempt.artifactsDir ?? ""))),
    String(execution.artifacts?.finalResult ? path.dirname(execution.artifacts.finalResult) : ""),
  ]).filter(Boolean));
  const legacyRuns = walkFiles(path.join(stateRoot, "runs"), "result.json", 100).map((filePath) => {
    const raw = readJson<Record<string, any>>(filePath, {});
    const artifactsDir = String(raw.artifactsDir ?? path.dirname(filePath));
    const updatedAtMs = safeMtimeMs(filePath);
    const fixability = Array.isArray(raw.fixability) ? raw.fixability.map((item: any) => ({
      findingId: String(item.findingId ?? "unknown"),
      policy: String(item.policy ?? "unknown"),
      reason: String(item.reason ?? ""),
      allowedClasses: asStringArray(item.allowedClasses),
      maxFiles: Number(item.maxFiles ?? 0),
      maxLines: Number(item.maxLines ?? 0),
      targetMode: String(item.targetMode ?? "none"),
    })) : [];
    const latestFixAttempt = readJson<Record<string, unknown> | null>(path.join(artifactsDir, "autofix-attempt.json"), null);
    return {
      runId: String(raw.runId ?? path.basename(path.dirname(filePath))),
      status: String(raw.status ?? "unknown"),
      repo: String(raw.context?.repo ?? "unknown"),
      prNumber: Number(raw.context?.prNumber ?? 0),
      prUrl: String(raw.context?.prUrl ?? ""),
      source: String(raw.context?.source ?? "unknown"),
      eventAction: nullableString(raw.context?.eventAction),
      workflowRunId: nullableString(raw.context?.workflowRunId),
      workflowRunAttempt: nullableString(raw.context?.workflowRunAttempt),
      bridgeEventId: nullableString(raw.context?.eventId),
      dedupeKey: String(raw.context?.dedupeKey ?? raw.policy?.idempotencyKey ?? ""),
      telegramNotificationSent: Boolean(raw.context?.telegramNotificationSent),
      headSha: String(raw.context?.headSha ?? ""),
      configHash: String(raw.configHash ?? raw.policy?.configHash ?? ""),
      policyAction: String(raw.policy?.allowedAction ?? "unknown"),
      policyReason: String(raw.policy?.reason ?? ""),
      hardBlocks: Array.isArray(raw.policy?.hardBlocks) ? raw.policy.hardBlocks : [],
      publisherStatus: String(raw.publisher?.status ?? "unknown"),
      publisherUrl: typeof raw.publisher?.url === "string" ? raw.publisher.url : null,
      reviewRisk: nullableString(raw.review?.overallRisk),
      securityRisk: nullableString(raw.security?.overallSecurityRisk),
      judgeRisk: nullableString(raw.judge?.risk),
      humanReviewRequired: Boolean(raw.judge?.humanReviewRequired),
      idempotencyKey: String(raw.policy?.idempotencyKey ?? ""),
      artifactsDir,
      updatedAtMs,
      taskId: typeof raw.context?.taskId === "string" ? raw.context.taskId : null,
      timeline: buildTimeline(artifactsDir),
      fixability,
      canGeneratePatch: fixability.some((item) => ["dry_run_allowed", "needs_human_approval"].includes(item.policy)),
      canRequestHumanApprovedFix: String(raw.config?.autofix?.mode ?? "") === "human_approved" && fixability.some((item) => item.policy === "needs_human_approval"),
      canRereview: Boolean(latestFixAttempt?.rereviewRunId),
      canAutonomousFix: String(raw.config?.autofix?.mode ?? "") === "autonomous" && fixability.some((item) => item.policy === "autonomous_allowed"),
      dangerousControlsVisible: Boolean(raw.config?.approvalEnabled || raw.config?.requestChangesEnabled || raw.config?.automergeEnabled || String(raw.config?.autofix?.mode ?? "") === "autonomous"),
      eligibilityEvidence: (raw.policy?.evidence ?? {}) as Record<string, unknown>,
      rollback: latestFixAttempt?.rollback && typeof latestFixAttempt.rollback === "object" ? latestFixAttempt.rollback as Record<string, unknown> : null,
      latestFixAttempt,
      normalized: false,
      flowId: null,
      finalStatus: null,
      finalReason: "Legacy artifact history; not a canonical execution record.",
      finalSha: null,
      settledAt: null,
      notificationDelivery: {},
    } satisfies PrSwarmRunSummary;
  }).filter((run) => !executionArtifactDirs.has(run.artifactsDir));
  const normalizedRuns = executions.map((execution) => executionToRunSummary(execution));
  const runs = [...normalizedRuns, ...legacyRuns].sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));

  const eventFiles = fs.existsSync(path.join(stateRoot, "events"))
    ? collectJsonFiles(path.join(stateRoot, "events"), 100)
    : [];
  const bridgeEventSummaries = eventFiles.map((filePath) => {
    const raw = readJson<Record<string, any>>(filePath, {});
    const event = raw.event ?? raw.compact ?? {};
    return {
      eventId: String(event.eventId ?? raw.eventId ?? path.basename(filePath, ".json")),
      repo: String(event.repo ?? raw.repo ?? "unknown"),
      status: String(raw.status ?? raw.dedupeType ?? "recorded"),
      recordedAtMs: typeof raw.recordedAtMs === "number" ? raw.recordedAtMs : null,
      action: typeof event.action === "string" ? event.action : null,
      prUrl: typeof event.prUrl === "string" ? event.prUrl : null,
      headSha: typeof event.headSha === "string" ? event.headSha : null,
      dedupeKey: typeof raw.dedupeKey === "string" ? raw.dedupeKey : null,
      githubRunId: typeof event.githubRunId === "string" ? event.githubRunId : null,
      githubRunAttempt: typeof event.githubRunAttempt === "string" ? event.githubRunAttempt : null,
      failureReason: typeof raw.reason === "string" ? raw.reason : null,
    } satisfies PrSwarmBridgeEventSummary;
  });
  const healthRecords = fs.existsSync(path.join(stateRoot, "bridge-health")) ? collectJsonFiles(path.join(stateRoot, "bridge-health"), 100).map((filePath) => readJson<Record<string, any>>(filePath, {})) : [];
  const lastEventAtMs = Math.max(0, ...bridgeEventSummaries.map((event) => event.recordedAtMs ?? 0));

  return {
    configPath,
    stateRoot,
    globalSafetyMode: String(config.global?.safetyMode ?? "normal"),
    liveWritesEnabled: Boolean(config.global?.liveWritesEnabled),
    globalAutonomousEnabled: Boolean(config.global?.autonomousEnabled),
    githubAuthHealth: "not_checked",
    repos,
    runs,
    bridgeEvents: bridgeEventSummaries,
    bridgeHealth: {
      lastEventAtMs: lastEventAtMs || null,
      accepted: bridgeEventSummaries.filter((event) => event.status === "event_id").length,
      ignoredOrBlocked: healthRecords.filter((item) => String(item.status ?? "").startsWith("ignored") || String(item.status ?? "").startsWith("blocked")).length,
      failed: bridgeEventSummaries.filter((event) => event.status === "rejected").length,
      tokenFailures: bridgeEventSummaries.filter((event) => ["invalid_signature", "invalid_token"].includes(String(event.failureReason ?? ""))).length,
      schemaFailures: bridgeEventSummaries.filter((event) => event.failureReason === "invalid_schema").length,
      stale: lastEventAtMs === 0,
    },
  };
}

function executionToRunSummary(execution: Record<string, any>): PrSwarmRunSummary {
  const attempts = Array.isArray(execution.attempts) ? execution.attempts : [];
  const attempt = attempts.at(-1) ?? {};
  const artifactsDir = String(attempt.artifactsDir ?? (execution.artifacts?.finalResult ? path.dirname(String(execution.artifacts.finalResult)) : ""));
  const result = artifactsDir ? readJson<Record<string, any>>(path.join(artifactsDir, "result.json"), {}) : {};
  const fixability = Array.isArray(result.fixability) ? result.fixability.map((item: any) => ({
    findingId: String(item.findingId ?? "unknown"), policy: String(item.policy ?? "unknown"), reason: String(item.reason ?? ""),
    allowedClasses: asStringArray(item.allowedClasses), maxFiles: Number(item.maxFiles ?? 0), maxLines: Number(item.maxLines ?? 0), targetMode: String(item.targetMode ?? "none"),
  })) : [];
  const latestFixAttempt = attempt.autofix && typeof attempt.autofix === "object" ? attempt.autofix as Record<string, unknown> : null;
  const stages = Object.entries(execution.stages ?? {}).map(([step, value]) => ({
    step, status: String((value as any)?.status ?? "pending"), reason: String((value as any)?.reason ?? ""), path: "",
  }));
  const pr = execution.pr ?? {};
  return {
    runId: String(attempt.runId ?? execution.flowId), status: String(execution.finalStatus ?? execution.status ?? "running"),
    repo: String(pr.repo ?? result.context?.repo ?? "unknown"), prNumber: Number(pr.number ?? result.context?.prNumber ?? 0), prUrl: String(pr.url ?? result.context?.prUrl ?? ""),
    source: String(execution.trigger ?? result.context?.source ?? "unknown"), eventAction: nullableString(execution.event?.action ?? result.context?.eventAction),
    workflowRunId: nullableString(execution.event?.githubRunId), workflowRunAttempt: nullableString(execution.event?.githubRunAttempt), bridgeEventId: nullableString(execution.event?.eventId),
    dedupeKey: String(result.context?.dedupeKey ?? ""), telegramNotificationSent: execution.notifications?.settled?.status === "sent",
    headSha: String(attempt.headSha ?? pr.sourceHeadSha ?? ""), configHash: String(result.configHash ?? ""), policyAction: String(attempt.policyAction ?? result.policy?.allowedAction ?? "unknown"),
    policyReason: String(execution.finalReason ?? result.policy?.reason ?? ""), hardBlocks: Array.isArray(result.policy?.hardBlocks) ? result.policy.hardBlocks : [],
    publisherStatus: String(attempt.publisherStatus ?? result.publisher?.status ?? "unknown"), publisherUrl: nullableString(result.publisher?.url),
    reviewRisk: nullableString(result.review?.overallRisk), securityRisk: nullableString(result.security?.overallSecurityRisk), judgeRisk: nullableString(result.judge?.risk),
    humanReviewRequired: Boolean(result.judge?.humanReviewRequired), idempotencyKey: String(result.policy?.idempotencyKey ?? ""), artifactsDir,
    updatedAtMs: dateMs(execution.settledAt ?? execution.updatedAt ?? execution.createdAt), taskId: nullableString(result.context?.taskId), timeline: stages, fixability,
    canGeneratePatch: false, canRequestHumanApprovedFix: false, canRereview: Boolean(latestFixAttempt?.rereviewRunId), canAutonomousFix: false, dangerousControlsVisible: false,
    eligibilityEvidence: (result.policy?.evidence ?? {}) as Record<string, unknown>, rollback: null, latestFixAttempt,
    normalized: true, flowId: String(execution.flowId), finalStatus: nullableString(execution.finalStatus), finalReason: nullableString(execution.finalReason), finalSha: nullableString(execution.finalSha), settledAt: nullableString(execution.settledAt), notificationDelivery: execution.notifications ?? {},
  };
}

function collectJsonFiles(root: string, limit: number) {
  const found: string[] = [];
  function walk(dir: string) {
    if (found.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) found.push(full);
      if (found.length >= limit) break;
    }
  }
  walk(root);
  return found;
}

function buildTimeline(artifactsDir: string): PrSwarmTimelineItem[] {
  const steps = ["context", "config-snapshot", "review", "security", "judge", "policy", "publisher", "fixability", "autofix-attempt", "result"];
  const timeline = steps.flatMap((step) => {
    const artifact = path.join(artifactsDir, `${step}.json`);
    return fs.existsSync(artifact) ? [{ step, status: "recorded", path: artifact }] : [];
  });
  if (fs.existsSync(artifactsDir)) {
    for (const entry of fs.readdirSync(artifactsDir)) {
      if (entry.startsWith("rereview-") && entry.endsWith(".json")) timeline.push({ step: "rereview", status: "recorded", path: path.join(artifactsDir, entry) });
    }
  }
  return timeline;
}

function safeMtimeMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function dateMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
