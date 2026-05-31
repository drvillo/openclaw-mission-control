import { NextResponse } from "next/server";
import { archiveObsidianTasks, refreshDerivedState } from "../../../lib/openclaw";

async function refreshBestEffort() {
  try {
    await refreshDerivedState();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function parseIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Task ids are required");
  }
  const ids = value.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("At least one task id is required");
  }
  return ids;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const result = await archiveObsidianTasks(parseIds(body.ids));
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
