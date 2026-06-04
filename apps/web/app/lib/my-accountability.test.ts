import { assert, test } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isActionWorkflowStatus,
  markActionAssertionDone,
  openMissionControlDb,
  reassignActionAssertion,
  updateActionAssertionStatus,
} from "@ocmc/db";
import { buildMyntIndexFromState, type MyntState } from "./mynt";
import {
  groupAcceptedSelfAssignedActions,
  normalizeMyAccountabilityActionStatus,
  partitionSelfAssignedDecisions,
  pendingSelfAssignedActions,
} from "./my-accountability";
import type { MeetingIndex, MeetingRecording } from "./meetings";

function state(): MyntState {
  return {
    version: 1,
    showSelfDefault: true,
    archivedItemIds: [],
    identities: [
      {
        id: "francesco@lunarrails.io",
        email: "francesco@lunarrails.io",
        displayName: "Francesco Vivoli",
        aliases: ["Francesco Vivoli", "francesco@lunarrails.io"],
        isSelf: true,
      },
      {
        id: "alice@example.com",
        email: "alice@example.com",
        displayName: "Alice Example",
        aliases: ["Alice Example"],
      },
    ],
  };
}

function action(id: string, assignee: string, reviewStatus: "needs_review" | "accepted", status: string | null) {
  return {
    kind: "action" as const,
    assertionId: `assertion-${id}`,
    reviewStatus,
    label: id,
    id,
    status,
    taskId: null,
    detailsRef: null,
    owner: null,
    assignee,
    confidence: "high",
    score: 7,
    dueDate: null,
    dueText: null,
    summary: `${assignee} action ${id}`,
    evidence: null,
    evidenceTimestamps: [],
    evidenceTargetTime: null,
  };
}

function decision(id: string, owner: string, reviewStatus: "needs_review" | "accepted") {
  return {
    kind: "decision" as const,
    assertionId: `assertion-${id}`,
    reviewStatus,
    label: id,
    id,
    status: null,
    taskId: null,
    detailsRef: null,
    owner,
    assignee: null,
    confidence: "high",
    score: 7,
    dueDate: null,
    dueText: null,
    summary: `${owner} decision ${id}`,
    evidence: null,
    evidenceTimestamps: [],
    evidenceTargetTime: null,
  };
}

function meeting(partial: Partial<MeetingRecording> = {}): MeetingRecording {
  return {
    id: "meeting-1",
    title: "Accountability review",
    date: "2026-05-20",
    dateTime: "2026-05-20T10:00:00Z",
    month: "2026-05",
    participants: ["Francesco Vivoli", "Alice Example"],
    recordingId: "1",
    playbackUrl: "https://example.test/fathom",
    generatedAt: null,
    filePath: "/tmp/meeting.md",
    obsidianRef: "Meeting Recordings/Fathom/one",
    actions: [],
    decisions: [],
    actionCount: 0,
    decisionCount: 0,
    ...partial,
  };
}

function index(meetings: MeetingRecording[]): MeetingIndex {
  return { root: "/tmp", generatedAt: null, transcriptCount: meetings.length, meetings, participants: [], months: [] };
}

function dbWithAction(reviewStatus: "needs_review" | "accepted" | "imported" = "needs_review") {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-web-action-workflow-"));
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  db.prepare(`
    INSERT INTO action_assertions (
      action_assertion_id, extraction_run_id, meeting_id, document_version_id,
      external_assertion_id, label, status, task_id, details_ref, raw_assignee, due_date, due_text,
      confidence, score, summary, evidence_text, evidence_target_time,
      fingerprint, sequence, review_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    "action-assertion-1",
    "extraction-run-1",
    "meeting-1",
    "document-version-1",
    "external-action-1",
    "C1",
    "todo",
    null,
    null,
    "Francesco Vivoli",
    null,
    null,
    "high",
    7,
    "Francesco follows up",
    null,
    null,
    "fingerprint-1",
    1,
    reviewStatus,
    "{}",
  );
  return { db, assertionId: "action-assertion-1" };
}

test("normalizes null and legacy action statuses to todo", () => {
  assert.equal(normalizeMyAccountabilityActionStatus(null), "todo");
  assert.equal(normalizeMyAccountabilityActionStatus("created"), "todo");
  assert.equal(normalizeMyAccountabilityActionStatus("In Progress"), "in_progress");
  assert.equal(normalizeMyAccountabilityActionStatus("done"), "done");
});

test("filters self-assigned review actions and ignores showSelfDefault map state", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        actions: [
          action("self-pending", "Francesco Vivoli", "needs_review", "created"),
          action("self-accepted", "Francesco Vivoli", "accepted", "next"),
          action("team-pending", "Alice Example", "needs_review", "todo"),
        ],
      }),
    ]),
    state(),
  );

  assert.deepEqual(pendingSelfAssignedActions(mynt).map((item) => item.id), ["self-pending"]);
  assert.equal(mynt.people.some((person) => person.isSelf), false);
  assert.equal(mynt.peopleWithSelf.some((person) => person.isSelf), true);
});

test("self-scoped helpers exclude archived assertions", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        actions: [
          action("self-archived-pending", "Francesco Vivoli", "needs_review", "todo"),
          action("self-active-pending", "Francesco Vivoli", "needs_review", "todo"),
        ],
      }),
    ]),
    { ...state(), archivedItemIds: ["self-archived-pending"] },
  );

  assert.deepEqual(pendingSelfAssignedActions(mynt).map((item) => item.id), ["self-active-pending"]);
});

test("groups accepted self-assigned actions into canonical columns", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        actions: [
          action("created", "Francesco Vivoli", "accepted", "created"),
          action("next", "Francesco Vivoli", "accepted", "next"),
          action("doing", "Francesco Vivoli", "accepted", "in_progress"),
          action("done", "Francesco Vivoli", "accepted", "done"),
          action("pending", "Francesco Vivoli", "needs_review", "next"),
        ],
      }),
    ]),
    state(),
  );

  const columns = groupAcceptedSelfAssignedActions(mynt);
  assert.deepEqual(columns.map((column) => [column.id, column.items.map((item) => item.id)]), [
    ["todo", ["created"]],
    ["next", ["next"]],
    ["in_progress", ["doing"]],
    ["done", ["done"]],
  ]);
});

test("partitions self-assigned decisions into pending and accepted logs", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        decisions: [
          decision("pending-decision", "Francesco Vivoli", "needs_review"),
          decision("accepted-decision", "Francesco Vivoli", "accepted"),
          decision("team-decision", "Alice Example", "accepted"),
        ],
      }),
    ]),
    state(),
  );

  const partitions = partitionSelfAssignedDecisions(mynt);
  assert.deepEqual(partitions.pending.map((item) => item.id), ["pending-decision"]);
  assert.deepEqual(partitions.accepted.map((item) => item.id), ["accepted-decision"]);
});

test("action status workflow rejects invalid statuses and persists valid statuses", () => {
  const { db, assertionId } = dbWithAction("accepted");

  assert.equal(isActionWorkflowStatus("blocked"), false);
  assert.throws(() => updateActionAssertionStatus(db, assertionId, "blocked" as never), /Action status must be/u);
  assert.deepEqual(updateActionAssertionStatus(db, assertionId, "in_progress"), { updated: 1, status: "in_progress" });

  const row = db.prepare(`SELECT status FROM action_assertions WHERE action_assertion_id = ?;`).get(assertionId) as { status?: string } | undefined;
  assert.equal(row?.status, "in_progress");
  db.close();
});

test("mark_action_done accepts pending actions and reassign_action updates assignee", () => {
  const { db, assertionId } = dbWithAction("needs_review");

  assert.deepEqual(markActionAssertionDone(db, assertionId), { updated: 1, status: "done" });
  assert.deepEqual(reassignActionAssertion(db, assertionId, "Alice Example"), { reassigned: 1 });

  const row = db.prepare(`
    SELECT review_status as reviewStatus, status, raw_assignee as rawAssignee
    FROM action_assertions
    WHERE action_assertion_id = ?;
  `).get(assertionId) as { reviewStatus?: string; status?: string; rawAssignee?: string } | undefined;
  assert.equal(row?.reviewStatus, "accepted");
  assert.equal(row?.status, "done");
  assert.equal(row?.rawAssignee, "Alice Example");
  db.close();
});
