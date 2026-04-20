import { NextResponse } from "next/server";
import { cancelFlow, refreshDerivedState } from "../../../lib/openclaw";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { lookup?: string };
    if (!body.lookup) {
      return NextResponse.json({ ok: false, error: "lookup is required" }, { status: 400 });
    }
    const result = await cancelFlow(body.lookup);
    await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
