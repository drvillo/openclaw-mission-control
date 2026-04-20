import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AuditFinding,
  CronJob,
  CronRun,
  EventEnvelope,
  MemoryHealth,
  RuntimeTask,
  TaskFlow,
  TaskSnapshot,
} from "@ocmc/shared";

export type DerivedStatePayload = {
  webhookEvents: EventEnvelope[];
  taskSnapshots: TaskSnapshot[];
  runtimeTasks: RuntimeTask[];
  taskFlows: TaskFlow[];
  auditFindings: AuditFinding[];
  memoryHealth?: MemoryHealth[];
  cronJobs?: CronJob[];
  cronRuns?: CronRun[];
};

export function openMissionControlDb(filePath: string): DatabaseSync {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      route_id TEXT,
      flow_id TEXT,
      owner_agent TEXT,
      status TEXT NOT NULL,
      payload_path TEXT,
      correlation_id TEXT,
      last_error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_snapshots (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      board TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      assignee_type TEXT NOT NULL,
      assignee TEXT,
      agent_status TEXT NOT NULL,
      created_on TEXT NOT NULL,
      remind_on TEXT NOT NULL,
      run_id TEXT NOT NULL,
      flow_id TEXT,
      details_ref TEXT NOT NULL,
      results_ref TEXT NOT NULL,
      log_ref TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_tasks (
      task_id TEXT PRIMARY KEY,
      runtime TEXT,
      status TEXT NOT NULL,
      agent_id TEXT,
      label TEXT,
      owner_key TEXT,
      source_id TEXT,
      run_id TEXT,
      delivery_status TEXT,
      terminal_summary TEXT,
      created_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      last_event_at INTEGER,
      cleanup_after INTEGER,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_flows (
      flow_id TEXT PRIMARY KEY,
      owner_key TEXT,
      goal TEXT,
      status TEXT NOT NULL,
      current_step TEXT,
      blocked_task_id TEXT,
      blocked_summary TEXT,
      created_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      last_event_at INTEGER,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_findings (
      finding_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT,
      token TEXT,
      detail TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_health (
      workspace_id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL,
      has_agents_md INTEGER NOT NULL DEFAULT 0,
      has_memory_md INTEGER NOT NULL DEFAULT 0,
      memory_dir_present INTEGER NOT NULL DEFAULT 0,
      has_today_daily INTEGER NOT NULL DEFAULT 0,
      latest_daily TEXT,
      qmd_healthy INTEGER NOT NULL DEFAULT 0,
      qmd_message TEXT NOT NULL,
      status TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_jobs (
      job_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      schedule_kind TEXT NOT NULL,
      schedule_label TEXT NOT NULL,
      session_target TEXT,
      wake_mode TEXT,
      last_run_status TEXT,
      last_run_at_ms INTEGER,
      next_run_at_ms INTEGER,
      last_duration_ms INTEGER,
      delivery_mode TEXT,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_runs (
      run_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      delivered INTEGER,
      delivery_status TEXT,
      session_id TEXT,
      session_key TEXT,
      run_at_ms INTEGER,
      duration_ms INTEGER,
      next_run_at_ms INTEGER,
      model TEXT,
      provider TEXT,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
  `);
  return db;
}

function replaceTable(db: DatabaseSync, table: string) {
  db.exec(`DELETE FROM ${table};`);
}

export function syncDerivedState(db: DatabaseSync, payload: DerivedStatePayload): void {
  const insertWebhook = db.prepare(`
    INSERT INTO webhook_events (
      event_id, source, event_type, route_id, flow_id, owner_agent, status,
      payload_path, correlation_id, last_error, attempt_count, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertTaskSnapshot = db.prepare(`
    INSERT INTO task_snapshots (
      id, title, board, status, owner, assignee_type, assignee, agent_status,
      created_on, remind_on, run_id, flow_id, details_ref, results_ref, log_ref,
      checked, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertRuntimeTask = db.prepare(`
    INSERT INTO runtime_tasks (
      task_id, runtime, status, agent_id, label, owner_key, source_id, run_id,
      delivery_status, terminal_summary, created_at, started_at, ended_at,
      last_event_at, cleanup_after, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertTaskFlow = db.prepare(`
    INSERT INTO task_flows (
      flow_id, owner_key, goal, status, current_step, blocked_task_id,
      blocked_summary, created_at, started_at, ended_at, last_event_at, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertAuditFinding = db.prepare(`
    INSERT INTO audit_findings (
      finding_id, kind, severity, code, status, token, detail, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertMemoryHealth = db.prepare(`
    INSERT INTO memory_health (
      workspace_id, workspace_path, has_agents_md, has_memory_md, memory_dir_present,
      has_today_daily, latest_daily, qmd_healthy, qmd_message, status, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertCronJob = db.prepare(`
    INSERT INTO cron_jobs (
      job_id, name, agent_id, enabled, schedule_kind, schedule_label, session_target,
      wake_mode, last_run_status, last_run_at_ms, next_run_at_ms, last_duration_ms,
      delivery_mode, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertCronRun = db.prepare(`
    INSERT INTO cron_runs (
      run_id, job_id, ts, action, status, summary, delivered, delivery_status,
      session_id, session_key, run_at_ms, duration_ms, next_run_at_ms, model,
      provider, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  try {
    db.exec("BEGIN;");
    replaceTable(db, "webhook_events");
    replaceTable(db, "task_snapshots");
    replaceTable(db, "runtime_tasks");
    replaceTable(db, "task_flows");
    replaceTable(db, "audit_findings");
    replaceTable(db, "memory_health");
    replaceTable(db, "cron_jobs");
    replaceTable(db, "cron_runs");

    for (const event of payload.webhookEvents) {
      insertWebhook.run(
        event.eventId,
        event.source,
        event.eventType,
        event.routeId ?? null,
        event.flowId ?? null,
        event.ownerAgent ?? null,
        event.status,
        event.payloadPath ?? null,
        event.correlationId ?? null,
        event.lastError ?? null,
        event.attemptCount,
        event.recordedAt,
        event.rawJson,
      );
    }

    for (const task of payload.taskSnapshots) {
      insertTaskSnapshot.run(
        task.id,
        task.title,
        task.board,
        task.status,
        task.owner,
        task.assigneeType,
        task.assignee,
        task.agentStatus,
        task.createdOn,
        task.remindOn,
        task.runId,
        task.flowId,
        task.detailsRef,
        task.resultsRef,
        task.logRef,
        task.checked ? 1 : 0,
        task.recordedAt,
        task.rawJson,
      );
    }

    for (const task of payload.runtimeTasks) {
      insertRuntimeTask.run(
        task.taskId,
        task.runtime ?? null,
        task.status,
        task.agentId ?? null,
        task.label ?? null,
        task.ownerKey ?? null,
        task.sourceId ?? null,
        task.runId ?? null,
        task.deliveryStatus ?? null,
        task.terminalSummary ?? null,
        task.createdAt ?? null,
        task.startedAt ?? null,
        task.endedAt ?? null,
        task.lastEventAt ?? null,
        task.cleanupAfter ?? null,
        task.recordedAt,
        task.rawJson,
      );
    }

    for (const flow of payload.taskFlows) {
      insertTaskFlow.run(
        flow.flowId,
        flow.ownerKey ?? null,
        flow.goal ?? null,
        flow.status,
        flow.currentStep ?? null,
        flow.blockedTaskId ?? null,
        flow.blockedSummary ?? null,
        flow.createdAt ?? null,
        flow.startedAt ?? null,
        flow.endedAt ?? null,
        flow.lastEventAt ?? null,
        flow.recordedAt,
        flow.rawJson,
      );
    }

    for (const finding of payload.auditFindings) {
      insertAuditFinding.run(
        finding.findingId,
        finding.kind,
        finding.severity,
        finding.code,
        finding.status ?? null,
        finding.token ?? null,
        finding.detail,
        finding.recordedAt,
        finding.rawJson,
      );
    }

    for (const workspace of payload.memoryHealth ?? []) {
      insertMemoryHealth.run(
        workspace.workspaceId,
        workspace.workspacePath,
        workspace.hasAgentsMd ? 1 : 0,
        workspace.hasMemoryMd ? 1 : 0,
        workspace.memoryDirPresent ? 1 : 0,
        workspace.hasTodayDaily ? 1 : 0,
        workspace.latestDaily,
        workspace.qmdHealthy ? 1 : 0,
        workspace.qmdMessage,
        workspace.status,
        workspace.recordedAt,
        workspace.rawJson,
      );
    }

    for (const job of payload.cronJobs ?? []) {
      insertCronJob.run(
        job.jobId,
        job.name,
        job.agentId,
        job.enabled ? 1 : 0,
        job.scheduleKind,
        job.scheduleLabel,
        job.sessionTarget ?? null,
        job.wakeMode ?? null,
        job.lastRunStatus ?? null,
        job.lastRunAtMs ?? null,
        job.nextRunAtMs ?? null,
        job.lastDurationMs ?? null,
        job.deliveryMode ?? null,
        job.recordedAt,
        job.rawJson,
      );
    }

    for (const run of payload.cronRuns ?? []) {
      insertCronRun.run(
        run.runId,
        run.jobId,
        run.ts,
        run.action,
        run.status,
        run.summary ?? null,
        run.delivered == null ? null : run.delivered ? 1 : 0,
        run.deliveryStatus ?? null,
        run.sessionId ?? null,
        run.sessionKey ?? null,
        run.runAtMs ?? null,
        run.durationMs ?? null,
        run.nextRunAtMs ?? null,
        run.model ?? null,
        run.provider ?? null,
        run.recordedAt,
        run.rawJson,
      );
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function countRows(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table};`).get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}
