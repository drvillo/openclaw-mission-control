import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openMissionControlDb, syncDerivedState, type DerivedStatePayload } from "@ocmc/db";
import { collectCronState } from "./cron";
import { DATABASE_PATH, OPENCLAW_HOME, SNAPSHOT_PATH, TASKS_ROOT, MISSION_CONTROL_STATE_DIR } from "./config";
import { collectWebhookEvents } from "./events";
import { collectMemoryHealth } from "./memory";
import { collectRoutingAttempts } from "./routing";
import { buildWorkerSnapshot, normalizeSessionTasks, normalizeWorkflowSnapshot } from "./runtime";
import { collectTaskSnapshots } from "./task-board";
import { gatewayCall, gatewayPages } from "./gateway";

const execFileAsync = promisify(execFile);
export type SourceFreshness = { status: "ok" | "stale" | "unavailable"; checkedAt: string; lastSuccessAt: string | null; error: string | null };
export type SourceReaders = Record<string, () => Promise<DerivedStatePayload>>;

/** A rejected source contributes no tables: syncDerivedState retains its last good rows. */
export async function collectRefreshSources(readers: SourceReaders, checkedAt: string, previous: Record<string, SourceFreshness> = {}) {
  const entries = Object.entries(readers);
  const settled = await Promise.allSettled(entries.map(([, read]) => Promise.resolve().then(read)));
  const payload: DerivedStatePayload = {};
  const sources: Record<string, SourceFreshness> = {};
  settled.forEach((result, index) => {
    const name = entries[index][0];
    if (result.status === "fulfilled") {
      Object.assign(payload, result.value);
      sources[name] = { status: "ok", checkedAt, lastSuccessAt: checkedAt, error: null };
    } else {
      const lastSuccessAt = previous[name]?.lastSuccessAt ?? null;
      // Do not publish subprocess stderr, model content, or credentials in dashboard errors.
      const reason = result.reason as { name?: string; message?: string; cmd?: string; code?: unknown } | null;
      const error = reason?.cmd ? `command exit ${String(reason.code ?? "unknown")}` : reason?.message?.slice(0, 180) ?? reason?.name ?? "SourceError";
      sources[name] = { status: lastSuccessAt ? "stale" : "unavailable", checkedAt, lastSuccessAt, error: `${name} refresh failed (${error}); retained previous data` };
    }
  });
  return { payload, sources };
}

async function workflowSnapshot() {
  const { stdout } = await execFileAsync(process.env.MISSION_CONTROL_PYTHON ?? "/Users/fonkey-oc/bin/oc-python", [path.join(OPENCLAW_HOME, "lib", "workflow_ledger.py"), "snapshot", "--json"], {
    cwd: OPENCLAW_HOME, env: { ...process.env, OPENCLAW_STATE_DIR: OPENCLAW_HOME }, timeout: 20_000, maxBuffer: 32 * 1024 * 1024,
  });
  return normalizeWorkflowSnapshot(JSON.parse(stdout));
}

export async function refreshMissionControlState(options?: { applyMemoryDoctor?: boolean }) {
  const recordedAt = new Date().toISOString();
  let previous: Record<string, SourceFreshness> = {};
  try { previous = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")).sources ?? {}; } catch { /* First refresh. */ }
  let sessions: ReturnType<typeof gatewayPages> | undefined;
  const readSessions = () => sessions ??= gatewayPages(gatewayCall, "sessions.list", "sessions", { rowMode: "dashboard", configuredAgentsOnly: true, activeMinutes: 90 * 24 * 60, sortBy: "activity" });
  const { payload, sources } = await collectRefreshSources({
    runtime: async () => ({ runtimeTasks: normalizeSessionTasks(await readSessions(), recordedAt) }),
    workflows: workflowSnapshot,
    cron: () => collectCronState(recordedAt),
    routing: async () => ({ routingAttempts: await collectRoutingAttempts(await readSessions()) }),
    tasks: async () => ({ taskSnapshots: collectTaskSnapshots(TASKS_ROOT, recordedAt) }),
    ingress: async () => ({ webhookEvents: collectWebhookEvents(MISSION_CONTROL_STATE_DIR) }),
    memory: async () => ({ memoryHealth: await collectMemoryHealth(OPENCLAW_HOME, recordedAt) }),
  }, recordedAt, previous);
  const db = openMissionControlDb(DATABASE_PATH);
  try {
    syncDerivedState(db, payload);
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    const boards = db.prepare("SELECT board, COUNT(*) AS count FROM task_snapshots GROUP BY board").all() as { board: string; count: number }[];
    const snapshot = {
      ...buildWorkerSnapshot({
        generatedAt: recordedAt,
        runtimeTaskCount: count("runtime_tasks"), taskFlowCount: count("task_flows"), auditFindingCount: count("audit_findings"),
        inboxCount: boards.find((row) => row.board === "inbox")?.count ?? 0,
        backlogCount: boards.find((row) => row.board === "backlog")?.count ?? 0,
        webhookEvents: db.prepare("SELECT source FROM webhook_events").all() as { source: string }[],
        routingAttempts: db.prepare("SELECT failure_mode AS failureMode, compliance_status AS complianceStatus, status FROM routing_attempts").all() as { failureMode: string; complianceStatus: string; status: string }[],
      }),
      sources,
    };
    await mkdir(MISSION_CONTROL_STATE_DIR, { recursive: true });
    await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    const temporary = `${SNAPSHOT_PATH}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    await rename(temporary, SNAPSHOT_PATH);
    return snapshot;
  } finally { db.close(); }
}
