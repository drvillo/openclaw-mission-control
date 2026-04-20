import type { AuditFinding, RuntimeTask, TaskFlow, WorkerSnapshot } from "@ocmc/shared";
import { AuditFindingSchema, RuntimeTaskSchema, TaskFlowSchema, WorkerSnapshotSchema } from "@ocmc/shared";

type RuntimeTaskList = {
  tasks?: unknown[];
  count?: number;
};

type FlowList = {
  flows?: unknown[];
  count?: number;
};

type AuditList = {
  findings?: unknown[];
};

function parseRuntimeTask(input: unknown, recordedAt: string): RuntimeTask {
  const task = (input ?? {}) as Record<string, unknown>;
  return RuntimeTaskSchema.parse({
    taskId: String(task.taskId ?? task.id ?? "unknown-task"),
    runtime: typeof task.runtime === "string" ? task.runtime : undefined,
    status: String(task.status ?? "unknown"),
    agentId: typeof task.agentId === "string" ? task.agentId : undefined,
    label: typeof task.label === "string" ? task.label : undefined,
    ownerKey: typeof task.ownerKey === "string" ? task.ownerKey : undefined,
    sourceId: typeof task.sourceId === "string" ? task.sourceId : undefined,
    runId: typeof task.runId === "string" ? task.runId : undefined,
    deliveryStatus: typeof task.deliveryStatus === "string" ? task.deliveryStatus : undefined,
    terminalSummary: typeof task.terminalSummary === "string" ? task.terminalSummary : undefined,
    createdAt: typeof task.createdAt === "number" ? task.createdAt : null,
    startedAt: typeof task.startedAt === "number" ? task.startedAt : null,
    endedAt: typeof task.endedAt === "number" ? task.endedAt : null,
    lastEventAt: typeof task.lastEventAt === "number" ? task.lastEventAt : null,
    cleanupAfter: typeof task.cleanupAfter === "number" ? task.cleanupAfter : null,
    recordedAt,
    rawJson: JSON.stringify(task, null, 2),
  });
}

function parseTaskFlow(input: unknown, recordedAt: string): TaskFlow {
  const flow = (input ?? {}) as Record<string, unknown>;
  return TaskFlowSchema.parse({
    flowId: String(flow.flowId ?? flow.id ?? "unknown-flow"),
    ownerKey: typeof flow.ownerKey === "string" ? flow.ownerKey : undefined,
    goal: typeof flow.goal === "string" ? flow.goal : undefined,
    status: String(flow.status ?? "unknown"),
    currentStep: typeof flow.currentStep === "string" ? flow.currentStep : undefined,
    blockedTaskId: typeof flow.blockedTaskId === "string" ? flow.blockedTaskId : undefined,
    blockedSummary: typeof flow.blockedSummary === "string" ? flow.blockedSummary : undefined,
    createdAt: typeof flow.createdAt === "number" ? flow.createdAt : null,
    startedAt: typeof flow.startedAt === "number" ? flow.startedAt : null,
    endedAt: typeof flow.endedAt === "number" ? flow.endedAt : null,
    lastEventAt: typeof flow.lastEventAt === "number" ? flow.lastEventAt : null,
    recordedAt,
    rawJson: JSON.stringify(flow, null, 2),
  });
}

function parseAuditFinding(input: unknown, recordedAt: string): AuditFinding {
  const finding = (input ?? {}) as Record<string, unknown>;
  const token = typeof finding.token === "string" ? finding.token : undefined;
  const code = String(finding.code ?? "unknown");
  const kind = String(finding.kind ?? "unknown");
  return AuditFindingSchema.parse({
    findingId: `${kind}:${token ?? "no-token"}:${code}`,
    kind,
    severity: String(finding.severity ?? "warn"),
    code,
    status: typeof finding.status === "string" ? finding.status : undefined,
    token,
    detail: String(finding.detail ?? "No detail"),
    recordedAt,
    rawJson: JSON.stringify(finding, null, 2),
  });
}

export function normalizeRuntimePayloads(
  tasksPayload: RuntimeTaskList,
  flowsPayload: FlowList,
  auditPayload: AuditList,
  recordedAt: string,
): { runtimeTasks: RuntimeTask[]; taskFlows: TaskFlow[]; auditFindings: AuditFinding[] } {
  return {
    runtimeTasks: (tasksPayload.tasks ?? []).map((task) => parseRuntimeTask(task, recordedAt)),
    taskFlows: (flowsPayload.flows ?? []).map((flow) => parseTaskFlow(flow, recordedAt)),
    auditFindings: (auditPayload.findings ?? []).map((finding) => parseAuditFinding(finding, recordedAt)),
  };
}

export function buildWorkerSnapshot(input: {
  runtimeTaskCount: number;
  taskFlowCount: number;
  auditFindingCount: number;
  inboxCount: number;
  backlogCount: number;
  webhookEvents: { source: string }[];
  generatedAt: string;
}): WorkerSnapshot {
  const bySource = input.webhookEvents.reduce<Record<string, number>>((counts, event) => {
    counts[event.source] = (counts[event.source] ?? 0) + 1;
    return counts;
  }, {});

  return WorkerSnapshotSchema.parse({
    generatedAt: input.generatedAt,
    tasks: {
      count: input.runtimeTaskCount,
      flows: input.taskFlowCount,
      findings: input.auditFindingCount,
      inbox: input.inboxCount,
      backlog: input.backlogCount,
    },
    ingress: {
      total: input.webhookEvents.length,
      bySource,
    },
  });
}
