import { NextResponse } from "next/server";
import { previewReconciliation } from "../../../lib/openclaw";

export async function POST() {
  try {
    const result = await previewReconciliation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
