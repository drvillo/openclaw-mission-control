import { NextResponse } from "next/server";
import { MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../lib/config";
import { buildMissionControlSemanticIndex, getMissionControlSemanticStatus, semanticExtractionSourceSummary } from "../../../../lib/semantic-layer-client";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled.", config: semanticExtractionSourceSummary() }, { status: 404 });
}

export async function GET() {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return disabled();
  try {
    return NextResponse.json({ ok: true, status: await getMissionControlSemanticStatus() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), config: semanticExtractionSourceSummary() }, { status: 500 });
  }
}

export async function POST() {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return disabled();
  try {
    const payload = await buildMissionControlSemanticIndex();
    return NextResponse.json({ ok: true, summary: `Built semantic index with ${payload.result.chunkCount} chunks.`, payload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), config: semanticExtractionSourceSummary() }, { status: 500 });
  }
}
