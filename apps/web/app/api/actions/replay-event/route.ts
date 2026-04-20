import { NextResponse } from "next/server";
import { refreshDerivedState, replayEvent } from "../../../lib/openclaw";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { source?: string; payloadPath?: string };
    if (!body.source || !body.payloadPath) {
      return NextResponse.json({ ok: false, error: "source and payloadPath are required" }, { status: 400 });
    }
    const result = await replayEvent(body.source, body.payloadPath);
    await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
