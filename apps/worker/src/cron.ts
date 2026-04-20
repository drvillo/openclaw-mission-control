import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CronJob, CronRun } from "@ocmc/shared";
import { CronJobSchema, CronRunSchema } from "@ocmc/shared";

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function toScheduleLabel(schedule: Record<string, unknown>): string {
  if (schedule.kind === "cron") {
    const expr = typeof schedule.expr === "string" ? schedule.expr : "unknown";
    const tz = typeof schedule.tz === "string" ? schedule.tz : "local";
    return `${expr} (${tz})`;
  }
  if (schedule.kind === "every") {
    const everyMs = typeof schedule.everyMs === "number" ? schedule.everyMs : 0;
    const hours = everyMs / 3600000;
    return hours >= 1 ? `every ${hours}h` : `every ${Math.round(everyMs / 60000)}m`;
  }
  return JSON.stringify(schedule);
}

export function collectCronState(openclawHome: string, recordedAt: string): { cronJobs: CronJob[]; cronRuns: CronRun[] } {
  const cronRoot = path.join(openclawHome, "cron");
  const jobsPath = path.join(cronRoot, "jobs.json");
  const jobsPayload = readJson<{ jobs?: unknown[] }>(jobsPath, { jobs: [] });
  const cronJobs = (jobsPayload.jobs ?? []).map((input) => {
    const job = (input ?? {}) as Record<string, unknown>;
    const schedule = ((job.schedule ?? {}) as Record<string, unknown>) ?? {};
    const state = ((job.state ?? {}) as Record<string, unknown>) ?? {};
    const delivery = ((job.delivery ?? {}) as Record<string, unknown>) ?? {};
    return CronJobSchema.parse({
      jobId: String(job.id ?? "unknown-job"),
      name: String(job.name ?? "Unnamed cron job"),
      agentId: String(job.agentId ?? "unknown-agent"),
      enabled: Boolean(job.enabled),
      scheduleKind: String(schedule.kind ?? "unknown"),
      scheduleLabel: toScheduleLabel(schedule),
      sessionTarget: typeof job.sessionTarget === "string" ? job.sessionTarget : null,
      wakeMode: typeof job.wakeMode === "string" ? job.wakeMode : null,
      lastRunStatus: typeof state.lastRunStatus === "string" ? state.lastRunStatus : null,
      lastRunAtMs: typeof state.lastRunAtMs === "number" ? state.lastRunAtMs : null,
      nextRunAtMs: typeof state.nextRunAtMs === "number" ? state.nextRunAtMs : null,
      lastDurationMs: typeof state.lastDurationMs === "number" ? state.lastDurationMs : null,
      deliveryMode: typeof delivery.mode === "string" ? delivery.mode : null,
      recordedAt,
      rawJson: JSON.stringify(job, null, 2),
    });
  });

  const cronRuns: CronRun[] = [];
  for (const job of cronJobs) {
    const runFile = path.join(cronRoot, "runs", `${job.jobId}.jsonl`);
    if (!existsSync(runFile)) {
      continue;
    }
    const lines = readFileSync(runFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-10);
    for (const line of lines) {
      const run = JSON.parse(line) as Record<string, unknown>;
      const ts = typeof run.ts === "number" ? run.ts : Date.parse(recordedAt);
      cronRuns.push(
        CronRunSchema.parse({
          runId:
            typeof run.sessionId === "string"
              ? `${job.jobId}:${run.sessionId}:${ts}`
              : `${job.jobId}:${ts}:${String(run.action ?? "event")}`,
          jobId: String(run.jobId ?? job.jobId),
          ts,
          action: String(run.action ?? "unknown"),
          status: String(run.status ?? "unknown"),
          summary: typeof run.summary === "string" ? run.summary : null,
          delivered: typeof run.delivered === "boolean" ? run.delivered : null,
          deliveryStatus: typeof run.deliveryStatus === "string" ? run.deliveryStatus : null,
          sessionId: typeof run.sessionId === "string" ? run.sessionId : null,
          sessionKey: typeof run.sessionKey === "string" ? run.sessionKey : null,
          runAtMs: typeof run.runAtMs === "number" ? run.runAtMs : null,
          durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
          nextRunAtMs: typeof run.nextRunAtMs === "number" ? run.nextRunAtMs : null,
          model: typeof run.model === "string" ? run.model : null,
          provider: typeof run.provider === "string" ? run.provider : null,
          recordedAt,
          rawJson: JSON.stringify(run, null, 2),
        }),
      );
    }
  }

  cronRuns.sort((a, b) => b.ts - a.ts);
  return { cronJobs, cronRuns };
}
