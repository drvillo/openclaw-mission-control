import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { countRows, openMissionControlDb, syncDerivedState } from "@ocmc/db";
import { collectCronState } from "./cron";
import { gatewayPages, type GatewayCall } from "./gateway";
import { collectRoutingAttempts } from "./routing";
import { collectRefreshSources } from "./refresh";
import { normalizeSessionTasks, normalizeWorkflowSnapshot } from "./runtime";

const now = "2026-11-08T18:00:00.000Z";

test("Gateway snapshots follow pagination and reject incomplete responses", async () => {
  const offsets: unknown[] = [];
  const call: GatewayCall = async (_method, params) => {
    offsets.push(params.offset);
    return params.offset === 0
      ? { sessions: [{ key: "one" }], hasMore: true, nextOffset: 1 }
      : { sessions: [{ key: "two" }], hasMore: false };
  };
  assert.equal((await gatewayPages(call, "sessions.list", "sessions")).length, 2);
  assert.deepEqual(offsets, [0, 1]);
  await assert.rejects(gatewayPages(async () => ({ hasMore: false }), "sessions.list", "sessions"), /omitted sessions/);
  await assert.rejects(gatewayPages(async () => ({ sessions: [], hasMore: true, nextOffset: 0 }), "sessions.list", "sessions"), /did not advance/);
});

test("cron uses supported APIs and retains disabled jobs and delivery outcomes", async () => {
  const calls: string[] = [];
  const state = await collectCronState(now, async (method, params) => {
    calls.push(method);
    if (method === "cron.list") {
      assert.equal(params.includeDisabled, true);
      return { jobs: [{ id: "job", name: "Alarm", agentId: "main", enabled: false, schedule: { kind: "every", everyMs: 60_000 } }], hasMore: false };
    }
    return { entries: [{ jobId: "job", ts: 123, action: "finished", status: "error", deliveryStatus: "not-delivered" }] };
  });
  assert.deepEqual(calls.sort(), ["cron.list", "cron.runs"]);
  assert.equal(state.cronJobs[0].enabled, false);
  assert.equal(state.cronRuns[0].status, "error");
  assert.equal(state.cronRuns[0].deliveryStatus, "not-delivered");
});

test("workflow snapshot preserves approval state and rejects malformed snapshots", () => {
  const flow = { flowId: "invoice-original", revision: 12, status: "waiting", currentStep: "approval", stateJson: { approval_status: "pending" }, waitJson: { kind: "approval" } };
  const result = normalizeWorkflowSnapshot({ schemaVersion: 1, generatedAt: now, flows: [flow], findings: [] });
  assert.equal(result.taskFlows[0].flowId, flow.flowId);
  assert.equal(result.taskFlows[0].status, "waiting");
  assert.deepEqual(JSON.parse(result.taskFlows[0].rawJson).waitJson, flow.waitJson);
  assert.throws(() => normalizeWorkflowSnapshot({ schemaVersion: 1, flows: [] }), /incomplete/);
  assert.throws(() => normalizeWorkflowSnapshot({ schemaVersion: 1, generatedAt: now, flows: [{}], findings: [] }), /identity/);
});

test("one failed source preserves its last good tables and business records while another advances", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ocmc-refresh-isolation-"));
  const db = openMissionControlDb(path.join(root, "test.sqlite"));
  try {
    db.prepare("INSERT INTO meetings (meeting_id, source_document_id, current_document_version_id, source_type, title, transcript_source_path, transcript_obsidian_ref, last_ingested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("meeting", "source", "version", "fathom", "Preserved meeting", "/fixture", "fixture", now, now, now);
    syncDerivedState(db, { taskFlows: [{ flowId: "waiting-invoice", status: "waiting", recordedAt: now, rawJson: "{\"approval_status\":\"pending\"}" }] });
    const result = await collectRefreshSources({
      workflows: async () => { throw new Error("ledger unavailable"); },
      runtime: async () => ({ runtimeTasks: normalizeSessionTasks([{ key: "agent:main:main", hasActiveRun: true, activeRunIds: ["run-a", "run-b"] }], now) }),
    }, now, { workflows: { status: "ok", checkedAt: now, lastSuccessAt: now, error: null } });
    assert.equal(result.sources.workflows.status, "stale");
    assert.equal(result.sources.runtime.status, "ok");
    assert.equal(result.payload.taskFlows, undefined);
    syncDerivedState(db, result.payload);
    assert.equal(countRows(db, "task_flows"), 1);
    assert.equal(countRows(db, "runtime_tasks"), 1);
    assert.equal(countRows(db, "meetings"), 1);
    assert.equal((db.prepare("SELECT status FROM task_flows").get() as { status: string }).status, "waiting");
    // An explicitly successful empty snapshot may clear a derived table.
    syncDerivedState(db, { runtimeTasks: [] });
    assert.equal(countRows(db, "runtime_tasks"), 0);
    assert.equal(countRows(db, "task_flows"), 1);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("routing consumes plain-string Gateway history and preserves accepted versus completed semantics", async () => {
  const messages = [
    { id: "user", timestamp: 1, role: "user", content: "send this by email" },
    { id: "assistant", timestamp: 2, role: "assistant", content: [{ type: "toolCall", id: "spawn-1", name: "sessions_spawn", arguments: { agentId: "mail-agent" } }] },
    { id: "tool", timestamp: 3, role: "toolResult", toolCallId: "spawn-1", content: JSON.stringify({ status: "accepted", childSessionKey: "agent:mail-agent:subagent:child", runId: "run-1" }) },
  ];
  const call: GatewayCall = async (method, params) => {
    assert.equal(method, "chat.history");
    assert.equal(params.sessionKey, "agent:main:main");
    return { messages, hasMore: false };
  };
  const rows = await collectRoutingAttempts([{ key: "agent:main:main", sessionId: "parent" }], call);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].routingId, "parent:spawn-1");
  assert.equal(rows[0].status, "awaiting_completion");
  assert.equal(rows[0].runId, "run-1");
  assert.equal(rows[0].accepted, true);
});
