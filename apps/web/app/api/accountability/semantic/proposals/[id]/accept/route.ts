import { openMissionControlDb, reviewSemanticConceptProposal } from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH, MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../../../lib/config";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
async function paramsOf(context: RouteContext) { return await context.params; }

export async function POST(request: Request, context: RouteContext) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  const { id } = await paramsOf(context);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const result = reviewSemanticConceptProposal(db, { proposalId: decodeURIComponent(id), decision: "accept", reviewer: typeof body.reviewer === "string" ? body.reviewer : null, reasons: Array.isArray(body.reasons) ? body.reasons.map(String) : [] });
    return NextResponse.json({ ok: true, summary: `Accepted semantic proposal${result.concept ? ` into ${result.concept.label}` : ""}.`, payload: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.close();
  }
}
