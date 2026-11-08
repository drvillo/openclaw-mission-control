import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadPrSwarmState } from "../../../lib/pr-swarm";

const CONFIG_PATH = "/Users/fonkey-oc/.openclaw/workspace/config/pr-swarm.repos.json";
const SAFETY_MODES = new Set(["normal", "comment_only", "dry_run", "emergency_stop"]);

async function loadRaw() {
  return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8").catch(() => '{"global":{},"repos":{}}'));
}

export async function GET() {
  const state = loadPrSwarmState({ configPath: CONFIG_PATH });
  return NextResponse.json({ ok: true, globalSafetyMode: state.globalSafetyMode, globalAutonomousEnabled: state.globalAutonomousEnabled, repos: state.repos.map((repo) => ({ repo: repo.repo, killSwitch: repo.repoKillSwitch })) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = await loadRaw();
  raw.global = raw.global ?? {};
  raw.repos = raw.repos ?? {};

  if (typeof body?.globalSafetyMode === "string") {
    if (!SAFETY_MODES.has(body.globalSafetyMode)) return NextResponse.json({ ok: false, error: "invalid globalSafetyMode" }, { status: 400 });
    raw.global.safetyMode = body.globalSafetyMode;
  }
  if (typeof body?.globalAutonomousEnabled === "boolean") {
    raw.global.autonomousEnabled = body.globalAutonomousEnabled;
  }
  if (typeof body?.repo === "string" && typeof body?.repoKillSwitch === "boolean") {
    const repo = body.repo.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) return NextResponse.json({ ok: false, error: "repo must be owner/name" }, { status: 400 });
    raw.repos[repo] = { ...(raw.repos[repo] ?? {}), repoKillSwitch: body.repoKillSwitch };
  }

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, state: loadPrSwarmState({ configPath: CONFIG_PATH }) });
}
