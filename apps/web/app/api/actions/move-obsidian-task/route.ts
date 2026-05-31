import { NextResponse } from "next/server";
import { moveObsidianTask, refreshDerivedState } from "../../../lib/openclaw";

async function refreshBestEffort() {
  try {
    await refreshDerivedState();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; status?: string };
    if (!body.id || !body.status) {
      throw new Error("Task id and target status are required");
    }
    const result = await moveObsidianTask(body.id, body.status);
    const refreshError = await refreshBestEffort();
    return NextResponse.json({
      ok: true,
      summary: refreshError ? `${result.summary}; refresh failed: ${refreshError}` : result.summary,
      payload: { ...result.payload, refresh_error: refreshError },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
