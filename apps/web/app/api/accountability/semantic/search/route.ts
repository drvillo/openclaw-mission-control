import { NextResponse } from "next/server";
import { MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../lib/config";
import { searchMissionControlSemanticIndex } from "../../../../lib/semantic-layer-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 8);
  if (!query) return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await searchMissionControlSemanticIndex(query, Number.isFinite(limit) ? limit : 8)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
