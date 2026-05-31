import { NextResponse } from "next/server";
import { loadMeetingDetail } from "../../../../lib/meetings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const meeting = loadMeetingDetail(id);
    if (!meeting) {
      return NextResponse.json({ ok: false, error: "Meeting transcript not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, meeting, transcript: meeting });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
