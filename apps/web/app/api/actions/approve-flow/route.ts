import { NextResponse } from "next/server";
import { approveFlow, refreshDerivedState } from "../../../lib/openclaw";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { lookup?: string; controllerId?: string };
    if (!body.lookup) {
      return NextResponse.json({ ok: false, error: "lookup is required" }, { status: 400 });
    }
    if (!body.controllerId) {
      return NextResponse.json({ ok: false, error: "controllerId is required" }, { status: 400 });
    }
    const result = await approveFlow(body.controllerId, body.lookup);
    await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
