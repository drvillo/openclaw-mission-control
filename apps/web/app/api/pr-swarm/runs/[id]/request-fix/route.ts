import { NextResponse } from "next/server";
import { loadPrSwarmState } from "../../../../../lib/pr-swarm";

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  const runId = decodeURIComponent(params.id);
  const state = loadPrSwarmState();
  const run = state.runs.find((item) => item.runId === runId);
  if (!run) return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  if (!run.canRequestHumanApprovedFix) return NextResponse.json({ ok: false, error: "human-approved fix is disabled by policy" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body?.approved !== true) return NextResponse.json({ ok: false, error: "explicit approval record is required" }, { status: 400 });
  return NextResponse.json(
    {
      ok: false,
      error: "human-approved fix must resume the PR Swarm Lobster workflow; Mission Control does not shell directly to the runner",
      runId,
      workflow: "scripts/pr_swarm/pr_swarm.lobster",
    },
    { status: 501 },
  );
}
