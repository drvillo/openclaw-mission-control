import { NextResponse } from "next/server";
import { updateMyntIdentityEmail } from "../../../../lib/mynt";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { identityId?: string; identityDisplayName?: string; email?: string };
    if (!body.identityId) {
      throw new Error("identityId is required");
    }
    const identity = updateMyntIdentityEmail(body.identityId, body.email ?? "", body.identityDisplayName);
    return NextResponse.json({
      ok: true,
      summary: `Updated email for ${identity.displayName}`,
      payload: { identity },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
