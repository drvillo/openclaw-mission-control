import { getSemanticConceptProposalRun, openMissionControlDb } from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH, MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../../lib/config";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function paramsOf(context: RouteContext) {
  return await context.params;
}

function promptProvider(run: { promptVersionJson?: string; rawJson?: string }) {
  for (const raw of [run.promptVersionJson, run.rawJson]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const model = parsed.model && typeof parsed.model === "object" ? parsed.model as Record<string, unknown> : null;
      if (typeof model?.provider === "string") return model.provider;
      const promptVersion = parsed.promptVersion && typeof parsed.promptVersion === "object" ? parsed.promptVersion as Record<string, unknown> : null;
      const nestedModel = promptVersion?.model && typeof promptVersion.model === "object" ? promptVersion.model as Record<string, unknown> : null;
      if (typeof nestedModel?.provider === "string") return nestedModel.provider;
      const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
      for (const proposal of proposals) {
        const value = proposal && typeof proposal === "object" ? proposal as Record<string, unknown> : null;
        const prompt = value?.prompt && typeof value.prompt === "object" ? value.prompt as Record<string, unknown> : null;
        const proposalModel = prompt?.model && typeof prompt.model === "object" ? prompt.model as Record<string, unknown> : null;
        if (typeof proposalModel?.provider === "string") return proposalModel.provider;
      }
    } catch {}
  }
  return "unknown";
}

export async function GET(_request: Request, context: RouteContext) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) {
    return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  }
  const { id } = await paramsOf(context);
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const proposalRun = getSemanticConceptProposalRun(db, decodeURIComponent(id));
    if (!proposalRun) return NextResponse.json({ ok: false, error: "Semantic proposal run not found" }, { status: 404 });
    if (promptProvider(proposalRun) !== "openai") return NextResponse.json({ ok: false, error: "Semantic proposal run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, proposalRun });
  } finally {
    db.close();
  }
}
