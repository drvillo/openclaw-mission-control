import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  acceptMeetingAssertions,
  isActionWorkflowStatus,
  markActionAssertionDone,
  reassignActionAssertion,
  rejectMeetingAssertions,
  updateActionAssertionStatus,
} from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH } from "../../lib/config";

export const runtime = "nodejs";

type MeetingAssertionReviewItem = {
  kind: "action" | "decision";
  assertionId: string;
};

type ReviewRequestBody = {
  operation?: unknown;
  items?: unknown;
  assertionId?: unknown;
  assignee?: unknown;
  status?: unknown;
};

function openReviewDb() {
  mkdirSync(path.dirname(MISSION_CONTROL_DB_PATH), { recursive: true });
  return new DatabaseSync(MISSION_CONTROL_DB_PATH);
}

function parseItems(value: unknown): MeetingAssertionReviewItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: MeetingAssertionReviewItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const kind = "kind" in item ? item.kind : null;
    const assertionId = "assertionId" in item ? item.assertionId : null;
    if ((kind !== "action" && kind !== "decision") || typeof assertionId !== "string" || !assertionId) {
      continue;
    }
    const key = `${kind}:${assertionId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({ kind, assertionId });
  }
  return items;
}

export async function POST(request: Request) {
  let body: ReviewRequestBody;
  try {
    body = (await request.json()) as ReviewRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const operation = body.operation;
  if (operation !== "accept" && operation !== "reject" && operation !== "reassign_action" && operation !== "update_action_status" && operation !== "mark_action_done") {
    return NextResponse.json({ ok: false, error: "operation must be accept, reject, reassign_action, update_action_status, or mark_action_done" }, { status: 400 });
  }

  const items = parseItems(body.items);
  if ((operation === "accept" || operation === "reject") && items.length === 0) {
    return NextResponse.json({ ok: false, error: "At least one assertion item is required" }, { status: 400 });
  }
  if (operation === "reassign_action" && (typeof body.assertionId !== "string" || !body.assertionId || typeof body.assignee !== "string" || !body.assignee.trim())) {
    return NextResponse.json({ ok: false, error: "assertionId and assignee are required" }, { status: 400 });
  }
  if ((operation === "update_action_status" || operation === "mark_action_done") && (typeof body.assertionId !== "string" || !body.assertionId)) {
    return NextResponse.json({ ok: false, error: "assertionId is required" }, { status: 400 });
  }
  if (operation === "update_action_status" && !isActionWorkflowStatus(body.status)) {
    return NextResponse.json({ ok: false, error: "status must be todo, next, in_progress, or done" }, { status: 400 });
  }

  const db = openReviewDb();
  try {
    if (operation === "reassign_action") {
      const assignee = (body.assignee as string).trim().replace(/\s+/gu, " ");
      const result = reassignActionAssertion(db, body.assertionId as string, assignee);
      const payload = { ...result, assertionId: body.assertionId, assignee };
      return NextResponse.json({
        ok: true,
        summary: payload.reassigned === 1 ? `Reassigned action to ${assignee}.` : "No action was reassigned.",
        payload,
      });
    }
    if (operation === "update_action_status") {
      const payload = updateActionAssertionStatus(db, body.assertionId as string, body.status as "todo" | "next" | "in_progress" | "done");
      return NextResponse.json({
        ok: true,
        summary: payload.updated === 1 ? `Updated action status to ${payload.status}.` : "No action status was updated.",
        payload: { ...payload, assertionId: body.assertionId },
      });
    }
    if (operation === "mark_action_done") {
      const payload = markActionAssertionDone(db, body.assertionId as string);
      return NextResponse.json({
        ok: true,
        summary: payload.updated === 1 ? "Marked action done." : "No action was marked done.",
        payload: { ...payload, assertionId: body.assertionId },
      });
    }

    const payload = operation === "accept" ? acceptMeetingAssertions(db, items) : rejectMeetingAssertions(db, items);
    const count = operation === "accept" ? payload.accepted : payload.rejected;
    return NextResponse.json({
      ok: true,
      summary: `${operation === "accept" ? "Accepted" : "Rejected"} ${count} meeting review item${count === 1 ? "" : "s"}.`,
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
