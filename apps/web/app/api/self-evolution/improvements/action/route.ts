import { NextResponse } from "next/server";
import { refreshDerivedState } from "../../../../lib/openclaw";
import { approveSelfEvolutionPacket, discardSelfEvolutionPacket } from "../../../../lib/self-evolution-packet-actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: unknown; improvementKey?: unknown; packetKey?: unknown; agentId?: unknown };
    if (body.action !== "approve" && body.action !== "discard") {
      return NextResponse.json({ ok: false, error: "action must be approve or discard" }, { status: 400 });
    }
    const key = typeof body.improvementKey === "string" ? body.improvementKey : typeof body.packetKey === "string" ? body.packetKey : "";
    if (!key.trim()) {
      return NextResponse.json({ ok: false, error: "improvementKey is required" }, { status: 400 });
    }

    const result = body.action === "approve" ? await approveSelfEvolutionPacket(key, typeof body.agentId === "string" ? body.agentId : undefined) : await discardSelfEvolutionPacket(key);
    await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
