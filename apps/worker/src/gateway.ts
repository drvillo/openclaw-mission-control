import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { OPENCLAW_BIN, OPENCLAW_HOME } from "./config";

const execFileAsync = promisify(execFile);
export type GatewayCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a Gateway JSON object");
  return value as Record<string, unknown>;
}

export const gatewayCall: GatewayCall = async (method, params) => {
  const env: NodeJS.ProcessEnv = { ...process.env, OPENCLAW_STATE_DIR: OPENCLAW_HOME, OPENCLAW_CONFIG_PATH: path.join(OPENCLAW_HOME, "openclaw.json") };
  // OPENCLAW_HOME is MC's state-root setting, not OpenClaw's home-directory override.
  delete env.OPENCLAW_HOME;
  delete env.OPENCLAW_GATEWAY_URL;
  delete env.OPENCLAW_GATEWAY_PORT;
  const { stdout } = await execFileAsync(OPENCLAW_BIN, ["gateway", "call", method, "--params", JSON.stringify(params), "--json", "--timeout", "15000"], {
    cwd: OPENCLAW_HOME, env, timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
  });
  const result = record(JSON.parse(stdout.trim()));
  if (result.ok === false) throw new Error(`Gateway ${method} failed`);
  return result;
};

/** Fetch every page or fail; an incomplete read must not erase last-good state. */
export async function gatewayPages(call: GatewayCall, method: string, key: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (let page = 0; page < 50; page += 1) {
    const payload = record(await call(method, { ...params, limit: 200, offset }));
    if (payload.omission && record(payload.omission).byteLimited === true) throw new Error(`Gateway ${method} truncated its response`);
    if (!Array.isArray(payload[key])) throw new Error(`Gateway ${method} omitted ${key}`);
    const batch = (payload[key] as unknown[]).map(record);
    rows.push(...batch);
    const total = typeof payload.total === "number" ? payload.total : typeof payload.totalCount === "number" ? payload.totalCount : null;
    const more = payload.hasMore === true || (total !== null && rows.length < total);
    if (!more && (payload.hasMore === false || total !== null || batch.length < 200)) return rows;
    const next = typeof payload.nextOffset === "number" ? payload.nextOffset : offset + batch.length;
    if (!batch.length || next <= offset) throw new Error(`Gateway ${method} pagination did not advance`);
    offset = next;
  }
  throw new Error(`Gateway ${method} exceeded the complete-snapshot page budget`);
}
