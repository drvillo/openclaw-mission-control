import { NextResponse } from "next/server";
import { approveSelfEvolutionPacket, refreshDerivedState } from "../../../../lib/openclaw";

async function refreshBestEffort() {
  try {
    await refreshDerivedState();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const packetId = String(body.packetId ?? body.packet_id ?? "").trim();
    if (!packetId) {
      return NextResponse.json({ ok: false, error: "packetId is required" }, { status: 400 });
    }
    const result = await approveSelfEvolutionPacket({
      packetId,
      dedupeKey: typeof body.dedupeKey === "string" ? body.dedupeKey : null,
      title: typeof body.title === "string" ? body.title : null,
      approvalClassification: typeof body.approvalClassification === "string" ? body.approvalClassification : null,
      reviewTaskId: typeof body.reviewTaskId === "string" ? body.reviewTaskId : null,
    });
    const refreshError = await refreshBestEffort();
    return NextResponse.json({ ok: true, summary: refreshError ? `${result.summary}; refresh failed: ${refreshError}` : result.summary, payload: { ...result.payload, refresh_error: refreshError } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
