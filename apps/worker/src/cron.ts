import type { CronJob, CronRun } from "@ocmc/shared";
import { CronJobSchema, CronRunSchema } from "@ocmc/shared";
import { gatewayCall, gatewayPages, record, type GatewayCall } from "./gateway";

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

export function normalizeCronState(jobs: Record<string, unknown>[], runs: Record<string, unknown>[], recordedAt: string): { cronJobs: CronJob[]; cronRuns: CronRun[] } {
  const cronJobs = jobs.map((input) => {
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
  for (const run of runs) {
      const ts = typeof run.ts === "number" ? run.ts : Date.parse(recordedAt);
      cronRuns.push(
        CronRunSchema.parse({
          runId:
            typeof run.sessionId === "string"
              ? `${String(run.jobId)}:${run.sessionId}:${ts}`
              : `${String(run.jobId)}:${ts}:${String(run.action ?? "event")}`,
          jobId: String(run.jobId ?? "unknown-job"),
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

  cronRuns.sort((a, b) => b.ts - a.ts);
  return { cronJobs, cronRuns };
}

export async function collectCronState(recordedAt: string, call: GatewayCall = gatewayCall) {
  const [jobs, response] = await Promise.all([
    gatewayPages(call, "cron.list", "jobs", { includeDisabled: true }),
    // Run history is a recent window, not a full archive. Avoid unbounded history scans.
    call("cron.runs", { scope: "all", sortDir: "desc", limit: 200 }),
  ]);
  const payload = record(response);
  if (!Array.isArray(payload.entries)) throw new Error("Gateway cron.runs omitted entries");
  const runs = payload.entries.map(record);
  return normalizeCronState(jobs, runs, recordedAt);
}
