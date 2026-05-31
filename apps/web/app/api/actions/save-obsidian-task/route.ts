import { NextResponse } from "next/server";
import { refreshDerivedState, saveObsidianTask } from "../../../lib/openclaw";

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
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.id) {
      throw new Error("Task id is required");
    }
    const result = await saveObsidianTask(body);
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
