import { importSemanticConceptProposalRun, listSemanticConceptProposalRuns, listSemanticRefreshRuns, openMissionControlDb } from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH, MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../lib/config";
import { pullMissionControlSemanticProposalRun } from "../../../../lib/semantic-layer-client";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled. Set MISSION_CONTROL_SEMANTIC_CONCEPTS=1 to enable shadow/review APIs." }, { status: 404 });
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
      const audit = parsed.audit && typeof parsed.audit === "object" ? parsed.audit as Record<string, unknown> : null;
      const auditProvider = audit?.provider && typeof audit.provider === "object" ? audit.provider as Record<string, unknown> : null;
      if (typeof auditProvider?.provider === "string") return auditProvider.provider;
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

function isOperationalProposalRun(run: { promptVersionJson?: string; rawJson?: string }) {
  if (promptProvider(run) === "openai") return true;
  for (const raw of [run.rawJson, run.promptVersionJson]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const diagnostics = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [];
      const promptVersion = parsed.promptVersion && typeof parsed.promptVersion === "object" ? parsed.promptVersion as Record<string, unknown> : null;
      const version = typeof promptVersion?.version === "string" ? promptVersion.version : "";
      const hasCalibratedFallback = version === "fallback-calibrated-v1"
        || diagnostics.some((item) => typeof item === "string" && item.startsWith("fallback_generation_mode:"));
      if (hasCalibratedFallback) return true;
    } catch {}
  }
  return false;
}

export async function GET() {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return disabled();
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const proposalRuns = listSemanticConceptProposalRuns(db, { reviewStatus: "all" })
      .filter(isOperationalProposalRun);
    return NextResponse.json({ ok: true, proposalRuns, refreshRuns: listSemanticRefreshRuns(db, 20) });
  } finally {
    db.close();
  }
}

export async function POST(request: Request) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return disabled();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action === "pull") {
    try {
      const result = await pullMissionControlSemanticProposalRun({
        query: typeof body.query === "string" ? body.query : null,
        reason: typeof body.reason === "string" ? body.reason : null,
        importIntoReview: body.importIntoReview !== false,
        maxProposals: Number(body.maxProposals ?? 12),
        maxPackets: Number(body.maxPackets ?? 8),
      });
      const imported = result.imported?.proposalsImported ?? 0;
      return NextResponse.json({ ok: true, summary: `Pulled semantic proposal run${result.imported ? ` and imported ${imported} proposal${imported === 1 ? "" : "s"}` : ""}.`, payload: result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
  const run = (body.proposalRun && typeof body.proposalRun === "object" ? body.proposalRun : body) as Record<string, unknown>;
  if (!isOperationalProposalRun({ promptVersionJson: JSON.stringify(run.promptVersion ?? {}), rawJson: JSON.stringify(run) })) {
    return NextResponse.json({ ok: false, error: "Refusing to import non-operational semantic proposal runs into Mission Control review." }, { status: 400 });
  }
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const result = importSemanticConceptProposalRun(db, run);
    return NextResponse.json({ ok: true, summary: `Imported ${result.proposalsImported} semantic proposal${result.proposalsImported === 1 ? "" : "s"}.`, payload: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.close();
  }
}
