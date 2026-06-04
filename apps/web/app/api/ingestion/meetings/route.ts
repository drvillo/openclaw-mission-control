import { NextResponse } from "next/server";
import { handleIngestMeetingsRequest } from "../../../../../worker/src/ingestion-api";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await handleIngestMeetingsRequest(body, request.headers);
  return NextResponse.json(result.body, { status: result.status });
}
