import { z } from "zod";

export const FlowRouteSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  match: z.record(z.string(), z.string()),
  flowTemplate: z.string().min(1),
  ownerAgent: z.string().min(1),
});

export const EventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  eventType: z.string().min(1),
  routeId: z.string().min(1).optional(),
  flowId: z.string().min(1).optional(),
  ownerAgent: z.string().min(1).optional(),
  status: z.string().min(1),
  payloadPath: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  lastError: z.string().min(1).optional(),
  attemptCount: z.number().int().nonnegative().default(0),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const TaskSnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  board: z.enum(["inbox", "backlog"]),
  status: z.string().min(1),
  owner: z.string().min(1),
  assigneeType: z.string().min(1),
  assignee: z.string().min(1),
  agentStatus: z.string().min(1),
  createdOn: z.string().min(1),
  remindOn: z.string().min(1),
  runId: z.string().min(1),
  flowId: z.string().min(1),
  detailsRef: z.string().min(1),
  resultsRef: z.string().min(1),
  logRef: z.string().min(1),
  checked: z.boolean(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const RuntimeTaskSchema = z.object({
  taskId: z.string().min(1),
  runtime: z.string().min(1).optional(),
  status: z.string().min(1),
  agentId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  ownerKey: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  deliveryStatus: z.string().min(1).optional(),
  terminalSummary: z.string().min(1).optional(),
  terminalOutcome: z.enum(["succeeded", "blocked"]).nullable().optional(),
  createdAt: z.number().int().nullable().optional(),
  startedAt: z.number().int().nullable().optional(),
  endedAt: z.number().int().nullable().optional(),
  lastEventAt: z.number().int().nullable().optional(),
  cleanupAfter: z.number().int().nullable().optional(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const TaskFlowSchema = z.object({
  flowId: z.string().min(1),
  syncMode: z.string().min(1).optional(),
  controllerId: z.string().min(1).optional(),
  ownerKey: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  status: z.string().min(1),
  currentStep: z.string().min(1).optional(),
  blockedTaskId: z.string().min(1).optional(),
  blockedSummary: z.string().min(1).optional(),
  createdAt: z.number().int().nullable().optional(),
  startedAt: z.number().int().nullable().optional(),
  endedAt: z.number().int().nullable().optional(),
  lastEventAt: z.number().int().nullable().optional(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const AuditFindingSchema = z.object({
  findingId: z.string().min(1),
  kind: z.string().min(1),
  severity: z.string().min(1),
  code: z.string().min(1),
  status: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  detail: z.string().min(1),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const MemoryHealthSchema = z.object({
  workspaceId: z.string().min(1),
  workspacePath: z.string().min(1),
  hasAgentsMd: z.boolean(),
  hasMemoryMd: z.boolean(),
  memoryDirPresent: z.boolean(),
  hasTodayDaily: z.boolean(),
  latestDaily: z.string().nullable(),
  qmdHealthy: z.boolean(),
  qmdMessage: z.string().min(1),
  status: z.enum(["ok", "daily_missing", "path_misconfigured", "qmd_unhealthy", "missing_agents_md", "missing_memory_md", "write_failed"]),
  memoryScope: z.enum(["shared", "local"]).optional(),
  pathStatus: z.enum(["ok", "misconfigured", "missing_link", "not_applicable"]).optional(),
  pathMessage: z.string().min(1).optional(),
  canonicalMemoryRoot: z.string().min(1).optional(),
  memoryDirPath: z.string().min(1).optional(),
  memoryFilePath: z.string().min(1).optional(),
  todayFilePath: z.string().min(1).optional(),
  workspaceMemoryTarget: z.string().nullable().optional(),
  workspaceMemoryFileTarget: z.string().nullable().optional(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const CronJobSchema = z.object({
  jobId: z.string().min(1),
  name: z.string().min(1),
  agentId: z.string().min(1),
  enabled: z.boolean(),
  scheduleKind: z.string().min(1),
  scheduleLabel: z.string().min(1),
  sessionTarget: z.string().nullable().optional(),
  wakeMode: z.string().nullable().optional(),
  lastRunStatus: z.string().nullable().optional(),
  lastRunAtMs: z.number().int().nullable().optional(),
  nextRunAtMs: z.number().int().nullable().optional(),
  lastDurationMs: z.number().int().nullable().optional(),
  deliveryMode: z.string().nullable().optional(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const CronRunSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().min(1),
  ts: z.number().int(),
  action: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1).nullable().optional(),
  delivered: z.boolean().nullable().optional(),
  deliveryStatus: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  sessionKey: z.string().nullable().optional(),
  runAtMs: z.number().int().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  nextRunAtMs: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  recordedAt: z.string().min(1),
  rawJson: z.string().min(1),
});

export const RoutingAttemptSchema = z.object({
  routingId: z.string().min(1),
  recordedAt: z.string().min(1),
  sourceAgent: z.string().min(1),
  sourceSessionId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  requestGroupKey: z.string().min(1),
  requestExcerpt: z.string().min(1),
  policyRuleId: z.string().nullable().optional(),
  policyDomain: z.string().nullable().optional(),
  expectedTargetAgent: z.string().nullable().optional(),
  actualTargetAgent: z.string().nullable().optional(),
  mechanism: z.string().min(1),
  toolCallId: z.string().nullable().optional(),
  accepted: z.boolean().nullable().optional(),
  childSessionKey: z.string().nullable().optional(),
  childSessionId: z.string().nullable().optional(),
  runId: z.string().nullable().optional(),
  status: z.string().min(1),
  completionSummary: z.string().nullable().optional(),
  failureMode: z.enum([
    "none",
    "wrong_tool",
    "incomplete_turn",
    "accepted_no_completion",
    "redundant_reconfirmation",
    "direct_fallback",
  ]),
  recoveryMode: z.enum(["none", "auto_recovered", "user_reprompted", "fallback_direct_exec"]),
  complianceStatus: z.enum(["compliant", "violation", "fallback", "unknown"]),
  rawJson: z.string().min(1),
});

export const WorkerSnapshotSchema = z.object({
  generatedAt: z.string().min(1),
  tasks: z.object({
    count: z.number().int().nonnegative(),
    flows: z.number().int().nonnegative(),
    findings: z.number().int().nonnegative(),
    inbox: z.number().int().nonnegative(),
    backlog: z.number().int().nonnegative(),
  }),
  ingress: z.object({
    total: z.number().int().nonnegative(),
    bySource: z.record(z.string(), z.number().int().nonnegative()),
  }),
  routing: z.object({
    total: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    compliant: z.number().int().nonnegative(),
  }),
});

export type FlowRoute = z.infer<typeof FlowRouteSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;
export type RuntimeTask = z.infer<typeof RuntimeTaskSchema>;
export type TaskFlow = z.infer<typeof TaskFlowSchema>;
export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type MemoryHealth = z.infer<typeof MemoryHealthSchema>;
export type CronJob = z.infer<typeof CronJobSchema>;
export type CronRun = z.infer<typeof CronRunSchema>;
export type RoutingAttempt = z.infer<typeof RoutingAttemptSchema>;
export type WorkerSnapshot = z.infer<typeof WorkerSnapshotSchema>;
