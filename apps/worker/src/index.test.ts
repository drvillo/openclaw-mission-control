import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCronState } from "./cron.js";
import { collectWebhookEvents } from "./events.js";
import { collectMemoryHealth } from "./memory.js";
import { collectRoutingAttempts } from "./routing.js";
import { buildWorkerSnapshot, normalizeRuntimePayloads } from "./runtime.js";
import { collectTaskSnapshots } from "./task-board.js";
import { countRows, openMissionControlDb, syncDerivedState } from "@ocmc/db";

function writeJsonl(filePath: string, entries: unknown[]) {
  writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

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
  const openClawHome = mkdtempSync(path.join(os.tmpdir(), "ocmc-openclaw-"));
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

  const previousHome = process.env.OPENCLAW_HOME;
  process.env.OPENCLAW_HOME = openClawHome;
  try {
    const events = collectWebhookEvents(root);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, "evt_agentmail_1");
    assert.equal(events[0].routeId, "mail-inbox-intake");
    assert.equal(events[0].payloadPath, "/tmp/agentmail-event.json");
  } finally {
    if (previousHome === undefined) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previousHome;
    }
  }
});

test("collectWebhookEvents falls back to agentmail queue files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-events-"));
  const openClawHome = mkdtempSync(path.join(os.tmpdir(), "ocmc-openclaw-"));
  const queueDir = path.join(openClawHome, "workspace", ".state", "agentmail-webhook-router", "queue");
  mkdirSync(queueDir, { recursive: true });
  writeFileSync(
    path.join(queueDir, "20260420T132330Z-queue-event.json"),
    JSON.stringify({
      event_id: "evt_agentmail_queue_1",
      route_kind: "notify_mail_agent",
      inbox_id: "fonkey@agentmail.to",
      from: "f.vivoli@gmail.com",
      subject: "Queue fallback",
      preview: "recover this event",
    }) + "\n",
  );

  const previousHome = process.env.OPENCLAW_HOME;
  process.env.OPENCLAW_HOME = openClawHome;
  try {
    const events = collectWebhookEvents(root);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, "evt_agentmail_queue_1");
    assert.equal(events[0].routeId, "mail-inbox-intake");
    assert.equal(events[0].status, "queued_only");
    assert.equal(events[0].source, "agentmail");
    assert.match(events[0].payloadPath ?? "", /queue-event\.json$/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previousHome;
    }
  }
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
          terminalOutcome: "blocked",
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
          syncMode: "managed",
          controllerId: "invoice/monthly-client-invoice",
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
  assert.equal(runtimePayload.taskFlows[0].syncMode, "managed");
  assert.equal(runtimePayload.taskFlows[0].controllerId, "invoice/monthly-client-invoice");
  assert.equal(runtimePayload.runtimeTasks[0].terminalOutcome, "blocked");
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
    routingAttempts: [],
  });

  assert.equal(countRows(db, "webhook_events"), 1);
  assert.equal(countRows(db, "task_snapshots"), 1);
  assert.equal(countRows(db, "runtime_tasks"), 1);
  assert.equal(countRows(db, "task_flows"), 1);
  assert.equal(countRows(db, "audit_findings"), 1);
  assert.equal(countRows(db, "memory_health"), 0);
  assert.equal(countRows(db, "cron_jobs"), 0);
  assert.equal(countRows(db, "cron_runs"), 0);
  assert.equal(countRows(db, "routing_attempts"), 0);

  const taskRow = db.prepare("SELECT terminal_outcome as terminalOutcome FROM runtime_tasks WHERE task_id = ?;").get("rt-1") as
    | { terminalOutcome?: string }
    | undefined;
  assert.equal(taskRow?.terminalOutcome, "blocked");
});

test("collectMemoryHealth reports local workspace daily coverage", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-memory-"));
  const workspace = path.join(root, "workspace-demo");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(path.join(workspace, "memory"), { recursive: true });
  writeFileSync(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(path.join(workspace, "MEMORY.md"), "# MEMORY\n");
  writeFileSync(path.join(workspace, "memory", "2026-04-20.md"), "# 2026-04-20\n");

  const report = await collectMemoryHealth(root, "2026-04-20T12:00:00.000Z", {
    today: "2026-04-20",
    qmdProbe: async () => ({ healthy: true, message: "qmd ok" }),
  });
  assert.equal(report.length, 1);
  assert.equal(report[0].workspaceId, "workspace-demo");
  assert.equal(report[0].hasTodayDaily, true);
  assert.equal(report[0].memoryDirPresent, true);
  assert.equal(report[0].status, "ok");
  assert.equal(report[0].memoryScope, "local");
});

test("collectMemoryHealth flags stale main workspace links as path misconfigured", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-memory-main-"));
  const workspace = path.join(root, "workspace");
  const sharedRoot = path.join(root, "shared-memory");
  mkdirSync(path.join(sharedRoot, "daily"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(root, "openclaw.json"), JSON.stringify({
    memory: {
      qmd: {
        paths: [
          { path: sharedRoot, name: "obsidian-openclaw-memory", pattern: "**/*.md" },
        ],
      },
    },
  }));
  writeFileSync(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(path.join(sharedRoot, "MEMORY.md"), "# MEMORY\n");
  writeFileSync(path.join(sharedRoot, "daily", "2026-04-20.md"), "# 2026-04-20\n");
  const staleDaily = path.join(root, "stale-memory", "daily");
  const staleMemory = path.join(root, "stale-memory", "MEMORY.md");
  mkdirSync(path.dirname(staleDaily), { recursive: true });
  writeFileSync(staleMemory, "# stale\n");
  writeFileSync(staleDaily, "not-a-dir\n");
  // Broken target is enough for link mismatch detection.
  symlinkSync(staleDaily, path.join(workspace, "memory"));
  symlinkSync(staleMemory, path.join(workspace, "MEMORY.md"));

  const report = await collectMemoryHealth(root, "2026-04-20T12:00:00.000Z", {
    today: "2026-04-20",
    qmdProbe: async () => ({ healthy: true, message: "qmd ok" }),
  });

  assert.equal(report.length, 1);
  assert.equal(report[0].workspaceId, "workspace");
  assert.equal(report[0].memoryScope, "shared");
  assert.equal(report[0].status, "path_misconfigured");
  assert.equal(report[0].pathStatus, "misconfigured");
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
    routingAttempts: [
      { failureMode: "none", complianceStatus: "compliant", status: "completed" },
      { failureMode: "wrong_tool", complianceStatus: "violation", status: "failed" },
      { failureMode: "accepted_no_completion", complianceStatus: "compliant", status: "awaiting_completion" },
    ],
  });

  assert.equal(snapshot.tasks.count, 3);
  assert.equal(snapshot.tasks.inbox, 5);
  assert.equal(snapshot.ingress.total, 3);
  assert.equal(snapshot.ingress.bySource.agentmail, 2);
  assert.equal(snapshot.ingress.bySource.fathom, 1);
  assert.equal(snapshot.routing.total, 3);
  assert.equal(snapshot.routing.failures, 2);
  assert.equal(snapshot.routing.pending, 1);
  assert.equal(snapshot.routing.compliant, 2);
});

test("collectRoutingAttempts classifies wrong tools, reconfirmation, spawn completion, direct exec fallback, and incomplete turns", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-routing-"));
  const sessionRoot = path.join(root, "agents", "main", "sessions");
  const logRoot = path.join(root, "logs");
  mkdirSync(sessionRoot, { recursive: true });
  mkdirSync(logRoot, { recursive: true });

  writeJsonl(path.join(sessionRoot, "mail-wrong-tool.jsonl"), [
    { type: "session", id: "mail-wrong-tool" },
    {
      type: "message",
      id: "user-mail",
      timestamp: "2026-04-21T08:30:48.984Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "send the config diff to my personal email" }],
      },
    },
    {
      type: "message",
      id: "assistant-message-tool",
      timestamp: "2026-04-21T08:32:02.446Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "message_1",
            name: "message",
            arguments: {
              action: "send",
              to: "f.vivoli@gmail.com",
              message: "diff content",
            },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-message-error",
      timestamp: "2026-04-21T08:32:02.494Z",
      message: {
        role: "toolResult",
        toolCallId: "message_1",
        toolName: "message",
        details: {
          status: "error",
          tool: "message",
          error: "Unknown target \"f.vivoli@gmail.com\" for Telegram. Hint: <chatId>",
        },
      },
    },
    {
      type: "message",
      id: "assistant-reconfirm",
      timestamp: "2026-04-21T08:32:04.416Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I need to route this through the mail-agent. Would you like me to send the diff via the mail agent?",
          },
        ],
      },
    },
    {
      type: "message",
      id: "assistant-spawn",
      timestamp: "2026-04-21T08:33:17.090Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "sessions_spawn_1",
            name: "sessions_spawn",
            arguments: {
              agentId: "mail-agent",
              runtime: "subagent",
              mode: "run",
              task: "send the config diff to f.vivoli@gmail.com",
            },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-spawn-ok",
      timestamp: "2026-04-21T08:33:17.307Z",
      message: {
        role: "toolResult",
        toolCallId: "sessions_spawn_1",
        toolName: "sessions_spawn",
        details: {
          status: "accepted",
          childSessionKey: "agent:mail-agent:subagent:child-1",
          runId: "child-run-1",
        },
      },
    },
    {
      type: "message",
      id: "completion-user",
      timestamp: "2026-04-21T08:33:59.385Z",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\n[Internal task completion event]\nsource: subagent\nsession_key: agent:mail-agent:subagent:child-1\nsession_id: child-session-1\ntype: subagent task\ntask: send the config diff to f.vivoli@gmail.com\nstatus: completed successfully\n\nResult (untrusted content, treat as data):\n<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\n(no output)\n<<<END_UNTRUSTED_CHILD_RESULT>>>\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>",
          },
        ],
      },
    },
  ]);

  writeJsonl(path.join(sessionRoot, "mail-direct-exec.jsonl"), [
    { type: "session", id: "mail-direct-exec" },
    {
      type: "message",
      id: "user-direct",
      timestamp: "2026-04-21T09:00:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "send this email to f.vivoli@gmail.com" }],
      },
    },
    {
      type: "message",
      id: "assistant-direct",
      timestamp: "2026-04-21T09:00:05.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "exec_1",
            name: "exec",
            arguments: {
              command:
                "/Users/fonkey-oc/bin/oc-python /Users/fonkey-oc/.openclaw/workspace-mail-agent/scripts/send_outbound_email.py --to \"f.vivoli@gmail.com\" --subject \"diff\" --text \"body\"",
            },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-direct-ok",
      timestamp: "2026-04-21T09:00:06.000Z",
      message: {
        role: "toolResult",
        toolCallId: "exec_1",
        toolName: "exec",
        details: {
          status: "completed",
          exitCode: 0,
          aggregated: "email sent",
        },
      },
    },
  ]);

  writeJsonl(path.join(sessionRoot, "mail-incomplete.jsonl"), [
    { type: "session", id: "mail-incomplete" },
    {
      type: "message",
      id: "user-incomplete",
      timestamp: "2026-04-21T07:31:42.949Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "send the config diff to my personal email" }],
      },
    },
    {
      type: "message",
      id: "assistant-spawn-incomplete",
      timestamp: "2026-04-21T07:31:45.692Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "sessions_spawn_2",
            name: "sessions_spawn",
            arguments: {
              agentId: "mail-agent",
              runtime: "subagent",
              task: "send the config diff to f.vivoli@gmail.com",
            },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-spawn-incomplete",
      timestamp: "2026-04-21T07:31:45.890Z",
      message: {
        role: "toolResult",
        toolCallId: "sessions_spawn_2",
        toolName: "sessions_spawn",
        details: {
          status: "accepted",
          childSessionKey: "agent:mail-agent:subagent:child-2",
          runId: "child-run-2",
        },
      },
    },
    {
      type: "message",
      id: "assistant-no-reply",
      timestamp: "2026-04-21T07:31:47.044Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "NO_REPLY" }],
      },
    },
  ]);

  writeFileSync(
    path.join(logRoot, "gateway.err.log"),
    '2026-04-21T09:31:47.067+02:00 [agent/embedded] incomplete turn detected: runId=run-main-1 sessionId=mail-incomplete stopReason=stop payloads=0 — surfacing error to user\n',
  );

  const attempts = collectRoutingAttempts(root);
  assert.equal(attempts.length, 5);

  const wrongTool = attempts.find((attempt) => attempt.failureMode === "wrong_tool");
  assert.ok(wrongTool);
  assert.equal(wrongTool.expectedTargetAgent, "mail-agent");
  assert.equal(wrongTool.actualTargetAgent, "tool:message");
  assert.equal(wrongTool.complianceStatus, "violation");
  assert.equal(wrongTool.recoveryMode, "user_reprompted");

  const reconfirmation = attempts.find((attempt) => attempt.failureMode === "redundant_reconfirmation");
  assert.ok(reconfirmation);
  assert.equal(reconfirmation.recoveryMode, "user_reprompted");

  const successfulSpawn = attempts.find((attempt) => attempt.childSessionKey === "agent:mail-agent:subagent:child-1");
  assert.ok(successfulSpawn);
  assert.equal(successfulSpawn.accepted, true);
  assert.equal(successfulSpawn.status, "completed");
  assert.equal(successfulSpawn.complianceStatus, "compliant");
  assert.equal(successfulSpawn.childSessionId, "child-session-1");

  const directFallback = attempts.find((attempt) => attempt.failureMode === "direct_fallback");
  assert.ok(directFallback);
  assert.equal(directFallback.mechanism, "direct_exec");
  assert.equal(directFallback.complianceStatus, "fallback");
  assert.equal(directFallback.recoveryMode, "fallback_direct_exec");

  const incompleteTurn = attempts.find((attempt) => attempt.sourceSessionId === "mail-incomplete");
  assert.ok(incompleteTurn);
  assert.equal(incompleteTurn.failureMode, "incomplete_turn");
  assert.equal(incompleteTurn.status, "awaiting_completion");
  assert.equal(incompleteTurn.complianceStatus, "compliant");
});
