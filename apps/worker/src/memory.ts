import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { MemoryHealthSchema, type MemoryHealth } from "@ocmc/shared";
import { gatewayCall, record, type GatewayCall } from "./gateway";

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeMemoryStatus(input: unknown, recordedAt: string): MemoryHealth[] {
  if (!Array.isArray(input)) throw new Error("Native memory status must be an array");
  return input.map((item) => {
    const entry = record(item);
    const health = record(entry.health);
    if (health.version !== 2 || health.agentId !== entry.agentId || health.providerId !== "memory-core" || !["ready", "degraded", "unavailable"].includes(String(health.status)) || typeof entry.workspacePath !== "string") throw new Error("Unsupported native memory health");
    const workspacePath = entry.workspacePath;
    const memoryDir = path.join(workspacePath, "memory");
    const memoryPath = path.join(workspacePath, "MEMORY.md");
    const today = recordedAt.slice(0, 10);
    const daily = existsSync(memoryDir) ? readdirSync(memoryDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort() : [];
    const unhealthy = health.status !== "ready";
    const legacy = optionalRecord(optionalRecord(health.details).legacy);
    const custom = optionalRecord(legacy.custom);
    // Pending lazy provider initialization is distinct from a broken persisted index.
    // Keep native degraded health visible; this does not assert embedding readiness.
    const providerPending = health.status === "degraded"
      && optionalRecord(custom.providerState).mode === "pending"
      && optionalRecord(custom.indexIdentity).status === "valid"
      && optionalRecord(optionalRecord(legacy.vector).index).state === "complete";
    // Provider health is a supported online read, not the offline CLI's aggregate diagnostics.
    const message = `Memory Core: ${health.status}${typeof health.message === "string" ? `; ${health.message}` : ""}; embedding efficacy not verified by this check`;
    return MemoryHealthSchema.parse({
      workspaceId: String(entry.agentId), workspacePath,
      hasAgentsMd: existsSync(path.join(workspacePath, "AGENTS.md")),
      hasMemoryMd: existsSync(memoryPath), memoryDirPresent: existsSync(memoryDir),
      hasTodayDaily: existsSync(path.join(memoryDir, `${today}.md`)), latestDaily: daily.at(-1) ?? null,
      // Retain DB column names for compatibility; the UI labels this as the memory index.
      qmdHealthy: !unhealthy, qmdMessage: message,
      status: providerPending ? "provider_pending" : unhealthy ? "index_unhealthy" : "ok",
      memoryScope: "local", pathStatus: "not_applicable", pathMessage: "Native workspace memory; no shared QMD links required",
      canonicalMemoryRoot: workspacePath, memoryDirPath: memoryDir, memoryFilePath: memoryPath,
      todayFilePath: path.join(memoryDir, `${today}.md`), workspaceMemoryTarget: null, workspaceMemoryFileTarget: null,
      recordedAt, rawJson: JSON.stringify(entry),
    });
  });
}

export async function collectMemoryHealth(openclawHome: string, recordedAt: string, options: { statusProbe?: () => Promise<unknown>; call?: GatewayCall } = {}) {
  if (options.statusProbe) return normalizeMemoryStatus(await options.statusProbe(), recordedAt);
  const config = record(JSON.parse(readFileSync(path.join(openclawHome, "openclaw.json"), "utf8")));
  const entries = Object.entries(record(record(config.agents).entries));
  const results: unknown[] = [];
  // Bound concurrent CLI bootstraps. Any rejected RPC fails the source so refresh
  // retains its previous complete memory snapshot instead of dropping agents.
  for (let offset = 0; offset < entries.length; offset += 4) {
    const batch = await Promise.all(entries.slice(offset, offset + 4).map(async ([agentId, input]) => {
      const agent = record(input);
      if (typeof agent.workspace !== "string" || !path.isAbsolute(agent.workspace)) throw new Error(`Memory workspace missing for ${agentId}`);
      return { agentId, workspacePath: agent.workspace, health: await (options.call ?? gatewayCall)("memory.status", { agentId }) };
    }));
    results.push(...batch);
  }
  return normalizeMemoryStatus(results, recordedAt);
}
