import { NextResponse } from "next/server";
import { loadPrSwarmState } from "../../../../../lib/pr-swarm";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  const runId = decodeURIComponent(params.id);
  const state = loadPrSwarmState();
  const run = state.runs.find((item) => item.runId === runId);
  if (!run) return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  if (!run.canGeneratePatch) return NextResponse.json({ ok: false, error: "generate patch is disabled by policy" }, { status: 403 });
  return NextResponse.json(
    {
      ok: false,
      error: "patch generation is a PR Swarm Lobster workflow control; Mission Control does not shell directly to the runner",
      runId,
      workflow: "scripts/pr_swarm/pr_swarm.lobster",
    },
    { status: 501 },
  );
}
