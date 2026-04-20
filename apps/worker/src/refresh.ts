import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openMissionControlDb, syncDerivedState } from "@ocmc/db";
import { collectCronState } from "./cron";
import { DATABASE_PATH, OPENCLAW_HOME, SNAPSHOT_PATH, TASKS_ROOT, MISSION_CONTROL_STATE_DIR } from "./config";
import { collectWebhookEvents } from "./events";
import { collectMemoryHealth } from "./memory";
import { buildWorkerSnapshot, normalizeRuntimePayloads } from "./runtime";
import { collectTaskSnapshots } from "./task-board";

const execFileAsync = promisify(execFile);

function parseJsonFromStdout(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("OpenClaw command returned empty stdout");
  }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;
  if (start < 0) {
    throw new Error(`OpenClaw command did not emit JSON: ${trimmed}`);
  }
  return JSON.parse(trimmed.slice(start));
}

async function runJsonCommand(args: string[]) {
  const childEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete childEnv.OPENCLAW_HOME;
  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    cwd: OPENCLAW_HOME,
    maxBuffer: 1024 * 1024 * 10,
    env: childEnv,
  });
  return parseJsonFromStdout(stdout || stderr);
}

export async function refreshMissionControlState(options?: { applyMemoryDoctor?: boolean }) {
  const recordedAt = new Date().toISOString();
  const [tasks, flows, audit] = await Promise.all([
    runJsonCommand(["tasks", "list", "--json"]),
    runJsonCommand(["tasks", "flow", "list", "--json"]),
    runJsonCommand(["tasks", "audit", "--json", "--limit", "50"]),
  ]);

  const taskSnapshots = collectTaskSnapshots(TASKS_ROOT, recordedAt);
  const webhookEvents = collectWebhookEvents(MISSION_CONTROL_STATE_DIR);
  const memoryHealth = await collectMemoryHealth(OPENCLAW_HOME, recordedAt, options?.applyMemoryDoctor ?? false);
  const cronState = collectCronState(OPENCLAW_HOME, recordedAt);
  const runtimePayload = normalizeRuntimePayloads(tasks, flows, audit, recordedAt);
  const snapshot = buildWorkerSnapshot({
    generatedAt: recordedAt,
    runtimeTaskCount: runtimePayload.runtimeTasks.length,
    taskFlowCount: runtimePayload.taskFlows.length,
    auditFindingCount: runtimePayload.auditFindings.length,
    inboxCount: taskSnapshots.filter((task) => task.board === "inbox").length,
    backlogCount: taskSnapshots.filter((task) => task.board === "backlog").length,
    webhookEvents,
  });

  const db = openMissionControlDb(DATABASE_PATH);
  syncDerivedState(db, {
    webhookEvents,
    taskSnapshots,
    runtimeTasks: runtimePayload.runtimeTasks,
    taskFlows: runtimePayload.taskFlows,
    auditFindings: runtimePayload.auditFindings,
    memoryHealth,
    cronJobs: cronState.cronJobs,
    cronRuns: cronState.cronRuns,
  });

  await mkdir(MISSION_CONTROL_STATE_DIR, { recursive: true });
  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return snapshot;
}
