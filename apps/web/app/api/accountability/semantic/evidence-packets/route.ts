import { NextResponse } from "next/server";
import { MISSION_CONTROL_SEMANTIC_CONCEPTS } from "../../../../lib/config";
import { buildMissionControlSemanticEvidencePackets } from "../../../../lib/semantic-layer-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!MISSION_CONTROL_SEMANTIC_CONCEPTS) return NextResponse.json({ ok: false, disabled: true, error: "Semantic concept integration is disabled." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const evidencePackets = await buildMissionControlSemanticEvidencePackets({
      query: typeof body.query === "string" ? body.query : null,
      reason: typeof body.reason === "string" ? body.reason : null,
      limit: Number(body.limit ?? 8),
    });
    return NextResponse.json({ ok: true, evidencePackets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
