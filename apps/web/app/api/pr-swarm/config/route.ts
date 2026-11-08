import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadPrSwarmState } from "../../../lib/pr-swarm";

const CONFIG_PATH = "/Users/fonkey-oc/.openclaw/workspace/config/pr-swarm.repos.json";

export async function GET() {
  const state = loadPrSwarmState({ configPath: CONFIG_PATH });
  return NextResponse.json({ ok: true, configPath: state.configPath, repos: state.repos });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const repo = typeof body?.repo === "string" ? body.repo.trim() : "";
  const repoConfig = body?.config && typeof body.config === "object" ? body.config : null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo) || !repoConfig) {
    return NextResponse.json({ ok: false, error: "repo and config are required" }, { status: 400 });
  }
  if (!["disabled", "comment_only", "review_actions"].includes(String(repoConfig.externalWriteMode ?? "disabled"))) {
    return NextResponse.json({ ok: false, error: "write mode must be disabled, comment_only, or review_actions" }, { status: 400 });
  }
  const autofixMode = String(repoConfig.autofix?.mode ?? "disabled");
  if (!["disabled", "dry_run", "human_approved", "autonomous"].includes(autofixMode)) {
    return NextResponse.json({ ok: false, error: "autofix mode must be disabled, dry_run, human_approved, or autonomous" }, { status: 400 });
  }
  if (Boolean(repoConfig.automergeEnabled) && !Boolean(repoConfig.approvalEnabled)) {
    return NextResponse.json({ ok: false, error: "automergeEnabled requires approvalEnabled" }, { status: 400 });
  }
  const raw = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8").catch(() => '{"global":{},"repos":{}}'));
  raw.repos = { ...(raw.repos ?? {}), [repo]: repoConfig };
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, repo, state: loadPrSwarmState({ configPath: CONFIG_PATH }) });
}
