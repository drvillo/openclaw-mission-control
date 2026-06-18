import { NextResponse } from "next/server";
import { refreshDerivedState } from "../../../../lib/openclaw";
import { approveSelfEvolutionPacket, discardSelfEvolutionPacket } from "../../../../lib/self-evolution-packet-actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: unknown; packetKey?: unknown; agentId?: unknown };
    if (body.action !== "approve" && body.action !== "discard") {
      return NextResponse.json({ ok: false, error: "action must be approve or discard" }, { status: 400 });
    }
    if (typeof body.packetKey !== "string" || !body.packetKey.trim()) {
      return NextResponse.json({ ok: false, error: "packetKey is required" }, { status: 400 });
    }

    const result = body.action === "approve" ? await approveSelfEvolutionPacket(body.packetKey, typeof body.agentId === "string" ? body.agentId : undefined) : await discardSelfEvolutionPacket(body.packetKey);
    await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
