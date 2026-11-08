import { NextResponse } from "next/server";
import { MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../../lib/config";
import { pullMissionControlSemanticProposalRun } from "../../../../../lib/semantic-layer-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) {
    return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await pullMissionControlSemanticProposalRun({
      query: typeof body.query === "string" ? body.query : null,
      reason: typeof body.reason === "string" ? body.reason : null,
      importIntoReview: body.importIntoReview !== false,
      maxProposals: Number(body.maxProposals ?? 12),
      maxPackets: Number(body.maxPackets ?? 8),
    });
    const imported = result.imported?.proposalsImported ?? 0;
    return NextResponse.json({ ok: true, summary: `Pulled semantic proposal run and imported ${imported} proposal${imported === 1 ? "" : "s"}.`, payload: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
