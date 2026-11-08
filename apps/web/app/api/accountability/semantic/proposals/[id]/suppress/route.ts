import { openMissionControlDb, suppressSemanticConceptProposal } from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH, MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../../../lib/config";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
async function paramsOf(context: RouteContext) { return await context.params; }

export async function POST(request: Request, context: RouteContext) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const { id } = await paramsOf(context);
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    const result = suppressSemanticConceptProposal(db, {
      proposalId: decodeURIComponent(id),
      reason: typeof body.reason === "string" ? body.reason : "suppressed from semantic tuning console",
      reviewer: "manual",
    });
    return NextResponse.json({ ok: true, summary: "Suppressed semantic proposal and future matching suggestions.", payload: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.close();
  }
}
