import { NextResponse } from "next/server";
import { loadPrSwarmState } from "../../../../../lib/pr-swarm";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  const runId = decodeURIComponent(params.id);
  const state = loadPrSwarmState();
  const run = state.runs.find((item) => item.runId === runId);
  if (!run) return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  return NextResponse.json(
    {
      ok: false,
      error: "rerun must be started through the OpenClaw webhook/TaskFlow/Lobster workflow, not Mission Control",
      prUrl: run.prUrl,
      workflow: "scripts/pr_swarm/pr_swarm.lobster",
    },
    { status: 501 },
  );
}
