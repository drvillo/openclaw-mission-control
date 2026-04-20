import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCronState } from "./cron.js";
import { collectWebhookEvents } from "./events.js";
import { collectMemoryHealth } from "./memory.js";
import { buildWorkerSnapshot, normalizeRuntimePayloads } from "./runtime.js";
import { collectTaskSnapshots } from "./task-board.js";
import { countRows, openMissionControlDb, syncDerivedState } from "@ocmc/db";

test("collectTaskSnapshots parses inbox and backlog task boards", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-task-board-"));
  writeFileSync(
    path.join(root, "Task Inbox.md"),
    `# Inbox

- [ ] <task title>
  - id: task-YYYYMMDD-XXX
  - status: inbox|next|waiting|done

---

- [ ] Fix webhook observability
  - id: task-20260420-001
  - status: next
  - owner: francesco
  - assignee_type: agent
  - assignee: coding-agent
  - agent_status: running
  - created_on: 2026-04-20
  - remind_on: none
  - run_id: none
  - flow_id: flow-1
  - details_ref: [[Tasks/Details/a]]
  - results_ref: [[Tasks/Details/a#Results]]
  - log_ref: [[Logs/Agent Activity Log]]
`,
  );
  writeFileSync(
    path.join(root, "Task Backlog.md"),
    `# Backlog

- [ ] Add mission control replay
  - id: task-20260420-002
  - status: backlog
  - owner: francesco
  - assignee_type: human
  - assignee: main
  - agent_status: none
  - created_on: 2026-04-20
  - remind_on: none
  - run_id: none
  - flow_id: none
  - details_ref: none
  - results_ref: none
  - log_ref: [[Logs/Agent Activity Log]]
`,
  );

  const tasks = collectTaskSnapshots(root, "2026-04-20T12:00:00.000Z");
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, "task-20260420-001");
  assert.equal(tasks[0].board, "inbox");
  assert.equal(tasks[1].board, "backlog");
});

test("collectWebhookEvents normalizes jsonl event logs", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-events-"));
  const agentmailDir = path.join(root, "events", "agentmail");
  mkdirSync(agentmailDir, { recursive: true });
  writeFileSync(
    path.join(agentmailDir, "20260420.jsonl"),
    JSON.stringify({
      recorded_at: "2026-04-20T10:00:00.000Z",
      event: {
        event_id: "evt_agentmail_1",
        type: "email.received",
        message_id: "msg-1",
      },
      result: {
        route_id: "mail-inbox-intake",
        flow_id: "flow-mail-1",
        owner_agent: "mail-agent",
        status: "queued",
      },
      event_file: "/tmp/agentmail-event.json",
    }) + "\n",
  );

  const events = collectWebhookEvents(root);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, "evt_agentmail_1");
  assert.equal(events[0].routeId, "mail-inbox-intake");
  assert.equal(events[0].payloadPath, "/tmp/agentmail-event.json");
});

test("syncDerivedState stores normalized rows in sqlite", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-db-"));
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  const recordedAt = "2026-04-20T12:00:00.000Z";
  const runtimePayload = normalizeRuntimePayloads(
    {
      tasks: [
        {
          taskId: "rt-1",
          runtime: "cron",
          status: "succeeded",
          agentId: "task-ops-agent",
          label: "Sweep",
          createdAt: 1,
          startedAt: 2,
          endedAt: 3,
        },
      ],
    },
    {
      flows: [
        {
          flowId: "flow-1",
          ownerKey: "system:test",
          goal: "Test flow",
          status: "running",
          currentStep: "dispatch",
        },
      ],
    },
    {
      findings: [
        {
          kind: "task",
          severity: "warn",
          code: "inconsistent_timestamps",
          token: "rt-1",
          detail: "startedAt is earlier than createdAt",
        },
      ],
    },
    recordedAt,
  );
  syncDerivedState(db, {
    webhookEvents: [
      {
        eventId: "evt-1",
        source: "agentmail",
        eventType: "email.received",
        routeId: "mail-inbox-intake",
        flowId: "flow-1",
        ownerAgent: "mail-agent",
        status: "queued",
        payloadPath: "/tmp/payload.json",
        correlationId: "msg-1",
        attemptCount: 0,
        recordedAt,
        rawJson: "{}",
      },
    ],
    taskSnapshots: [
      {
        id: "task-20260420-001",
        title: "Fix webhook observability",
        board: "inbox",
        status: "next",
        owner: "francesco",
        assigneeType: "agent",
        assignee: "coding-agent",
        agentStatus: "running",
        createdOn: "2026-04-20",
        remindOn: "none",
        runId: "none",
        flowId: "flow-1",
        detailsRef: "[[Tasks/Details/a]]",
        resultsRef: "[[Tasks/Details/a#Results]]",
        logRef: "[[Logs/Agent Activity Log]]",
        checked: false,
        recordedAt,
        rawJson: "{}",
      },
    ],
    runtimeTasks: runtimePayload.runtimeTasks,
    taskFlows: runtimePayload.taskFlows,
    auditFindings: runtimePayload.auditFindings,
    memoryHealth: [],
    cronJobs: [],
    cronRuns: [],
  });

  assert.equal(countRows(db, "webhook_events"), 1);
  assert.equal(countRows(db, "task_snapshots"), 1);
  assert.equal(countRows(db, "runtime_tasks"), 1);
  assert.equal(countRows(db, "task_flows"), 1);
  assert.equal(countRows(db, "audit_findings"), 1);
  assert.equal(countRows(db, "memory_health"), 0);
  assert.equal(countRows(db, "cron_jobs"), 0);
  assert.equal(countRows(db, "cron_runs"), 0);
});

test("collectMemoryHealth creates missing daily memory files when apply=true", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-memory-"));
  const workspace = path.join(root, "workspace-demo");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(path.join(workspace, "MEMORY.md"), "# MEMORY\n");

  const report = await collectMemoryHealth(root, "2026-04-20T12:00:00.000Z", true, "2026-04-20");
  assert.equal(report.length, 1);
  assert.equal(report[0].workspaceId, "workspace-demo");
  assert.equal(report[0].hasTodayDaily, true);
  assert.equal(report[0].memoryDirPresent, true);
});

test("collectCronState reads cron jobs and recent runs", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-cron-"));
  const cronRoot = path.join(root, "cron");
  mkdirSync(path.join(cronRoot, "runs"), { recursive: true });
  writeFileSync(
    path.join(cronRoot, "jobs.json"),
    JSON.stringify(
      {
        jobs: [
          {
            id: "job-1",
            name: "Daily self-improvement recommendations",
            agentId: "research-agent",
            enabled: true,
            schedule: { kind: "cron", expr: "0 3 * * *", tz: "Europe/Rome" },
            state: { lastRunStatus: "ok", lastRunAtMs: 1, nextRunAtMs: 2, lastDurationMs: 3 },
            delivery: { mode: "announce" },
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(cronRoot, "runs", "job-1.jsonl"),
    `${JSON.stringify({
      ts: 10,
      jobId: "job-1",
      action: "finished",
      status: "ok",
      summary: "Digest sent",
      delivered: true,
      deliveryStatus: "delivered",
      sessionId: "session-1",
      runAtMs: 5,
      durationMs: 6,
      model: "gpt-5.4",
      provider: "openai-codex",
    })}\n`,
  );

  const state = collectCronState(root, "2026-04-20T12:00:00.000Z");
  assert.equal(state.cronJobs.length, 1);
  assert.equal(state.cronJobs[0].scheduleLabel, "0 3 * * * (Europe/Rome)");
  assert.equal(state.cronRuns.length, 1);
  assert.equal(state.cronRuns[0].jobId, "job-1");
  assert.equal(state.cronRuns[0].status, "ok");
});

test("buildWorkerSnapshot summarizes derived counts", () => {
  const snapshot = buildWorkerSnapshot({
    generatedAt: "2026-04-20T12:00:00.000Z",
    runtimeTaskCount: 3,
    taskFlowCount: 2,
    auditFindingCount: 4,
    inboxCount: 5,
    backlogCount: 6,
    webhookEvents: [{ source: "agentmail" }, { source: "agentmail" }, { source: "fathom" }],
  });

  assert.equal(snapshot.tasks.count, 3);
  assert.equal(snapshot.tasks.inbox, 5);
  assert.equal(snapshot.ingress.total, 3);
  assert.equal(snapshot.ingress.bySource.agentmail, 2);
  assert.equal(snapshot.ingress.bySource.fathom, 1);
});
