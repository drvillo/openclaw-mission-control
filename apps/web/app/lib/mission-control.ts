import fs from "node:fs";
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
};

export type DashboardTask = {
  id: string;
  title: string;
  board: string;
  status: string;
  assignee: string;
  agentStatus: string;
  flowId: string | null;
  detailsRef: string;
};

export type DashboardRuntimeTask = {
  taskId: string;
  status: string;
  runtime: string | null;
  agentId: string | null;
  label: string | null;
  ownerKey: string | null;
  runId: string | null;
  createdAt: number | null;
};

export type DashboardFlow = {
  flowId: string;
  status: string;
  ownerKey: string | null;
  goal: string | null;
  currentStep: string | null;
  blockedSummary: string | null;
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
  hasAgentsMd: number;
  hasMemoryMd: number;
  hasTodayDaily: number;
  latestDaily: string | null;
  qmdHealthy: number;
  qmdMessage: string;
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
  model: string | null;
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
    return db.prepare(sql).all() as T[];
  } catch {
    return [];
  }
}

export function loadDashboardState() {
  const snapshot = readJson<SnapshotRow>(SNAPSHOT_PATH, {
    generatedAt: null,
    tasks: { count: 0, flows: 0, findings: 0, inbox: 0, backlog: 0 },
    ingress: { total: 0, bySource: {} },
  });
  const db = openDb();

  const tasks = queryRows<DashboardTask>(
    db,
    `
      SELECT id, title, board, status, assignee, agent_status as agentStatus, flow_id as flowId, details_ref as detailsRef
      FROM task_snapshots
      ORDER BY board ASC, created_on DESC, id DESC
      LIMIT 25;
    `,
  );
  const runtimeTasks = queryRows<DashboardRuntimeTask>(
    db,
    `
      SELECT task_id as taskId, status, runtime, agent_id as agentId, label, owner_key as ownerKey, run_id as runId, created_at as createdAt
      FROM runtime_tasks
      ORDER BY created_at DESC
      LIMIT 25;
    `,
  );
  const flows = queryRows<DashboardFlow>(
    db,
    `
      SELECT flow_id as flowId, status, owner_key as ownerKey, goal, current_step as currentStep, blocked_summary as blockedSummary
      FROM task_flows
      ORDER BY recorded_at DESC
      LIMIT 25;
    `,
  );
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
             has_today_daily as hasTodayDaily, latest_daily as latestDaily, qmd_healthy as qmdHealthy, qmd_message as qmdMessage
      FROM memory_health
      ORDER BY status DESC, workspace_id ASC;
    `,
  );
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
      SELECT run_id as runId, job_id as jobId, ts, status, action, summary, delivery_status as deliveryStatus, model
      FROM cron_runs
      ORDER BY ts DESC
      LIMIT 25;
    `,
  );

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
    roots: {
      openclawHome: OPENCLAW_HOME,
      tasksRoot: TASKS_ROOT,
      stateDir: MISSION_CONTROL_STATE_DIR,
      dbPath: MISSION_CONTROL_DB_PATH,
    },
  };
}
