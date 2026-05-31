import { NextResponse } from "next/server";
import { archiveMyntItems, buildMyntIndex, previewMyntArchive } from "../../../lib/mynt";
import { loadMeetingIndex } from "../../../lib/meetings";
import { archiveObsidianTasks, loadObsidianTaskBoard, refreshDerivedState } from "../../../lib/openclaw";

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
    const body = (await request.json()) as { olderThanDays?: number; apply?: boolean };
    const olderThanDays = Number.isFinite(body.olderThanDays) ? Number(body.olderThanDays) : 30;
    const taskBoard = await loadObsidianTaskBoard();
    const mynt = buildMyntIndex(loadMeetingIndex(), taskBoard);
    const preview = previewMyntArchive(mynt.items, taskBoard.tasks, olderThanDays);

    if (!body.apply) {
      return NextResponse.json({ ok: true, summary: "Archive preview generated", payload: preview });
    }

    archiveMyntItems(preview.itemIds);
    const taskResult = preview.linkedTaskIds.length > 0 ? await archiveObsidianTasks(preview.linkedTaskIds) : null;
    const refreshError = await refreshBestEffort();
    return NextResponse.json({
      ok: true,
      summary: `Archived ${preview.itemCount} Mynt item${preview.itemCount === 1 ? "" : "s"} and ${preview.linkedTaskCount} linked task${preview.linkedTaskCount === 1 ? "" : "s"}`,
      payload: { preview, task_result: taskResult?.payload ?? null, refresh_error: refreshError },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

