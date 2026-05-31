import { NextResponse } from "next/server";
import { approveMyntAlias } from "../../../../lib/mynt";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { identityId?: string; identityDisplayName?: string; raw?: string };
    if (!body.identityId || !body.raw) {
      throw new Error("identityId and raw alias are required");
    }
    const identity = approveMyntAlias(body.identityId, body.raw, body.identityDisplayName);
    return NextResponse.json({
      ok: true,
      summary: `Added alias to ${identity.displayName}`,
      payload: { identity },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
