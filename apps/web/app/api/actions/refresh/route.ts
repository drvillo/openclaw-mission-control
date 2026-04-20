import { NextResponse } from "next/server";
import { refreshDerivedState } from "../../../lib/openclaw";

export async function POST() {
  try {
    const result = await refreshDerivedState();
    return NextResponse.json({ ok: true, summary: result.summary, payload: result.payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
