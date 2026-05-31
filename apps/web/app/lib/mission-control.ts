import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  MISSION_CONTROL_DB_PATH,
  OPENCLAW_HOME,
  SNAPSHOT_PATH,
  TASKS_ROOT,
  MISSION_CONTROL_STATE_DIR,
} from "./config";

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
      ORDER BY CASE WHEN name = 'Daily self-improvement recommendations' THEN 0 ELSE 1 END,
               next_run_at_ms ASC, name ASC
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

  db?.close();

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
    roots: {
      openclawHome: OPENCLAW_HOME,
      tasksRoot: TASKS_ROOT,
      stateDir: MISSION_CONTROL_STATE_DIR,
      dbPath: MISSION_CONTROL_DB_PATH,
    },
  };
}
