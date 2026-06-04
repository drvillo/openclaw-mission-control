import { assert, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openMissionControlDb } from "@ocmc/db";
import { ingestMeetingNoteFile } from "../../../worker/src/meetings-ingestion";
import { loadMeetingDetailWithOptions, loadMeetingIndexFromMarkdownRoot, loadMeetingIndexWithOptions, parseMeetingReviewSections } from "./meetings";

function markdownWithSections(actions: string, decisions: string) {
  return `# Meeting

<!-- FATHOM:SECTION actions:start -->
## Actions
${actions}
<!-- FATHOM:SECTION actions:end -->

<!-- FATHOM:SECTION decisions:start -->
## Decisions
${decisions}
<!-- FATHOM:SECTION decisions:end -->

<!-- FATHOM:SECTION transcript:start -->
## Transcript
\`\`\`text
[00:00:01] A: Hello.
\`\`\`
<!-- FATHOM:SECTION transcript:end -->
`;
}

test("parseMeetingReviewSections parses one action and two decisions", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      `### C1
- action_id: action-1
- status: needs_review
- assignee: Alice
- confidence: high
- score: 7

Alice to follow up with the team

\`\`\`text
- [00:01:00] Bob: Before. > [00:01:05] Alice: I will follow up. - [00:01:08] Bob: Thanks.
\`\`\``,
      `### D1
- decision_id: decision-1
- owner: Bob
- confidence: medium
- score: 5

Use the new process

\`\`\`text
- [00:02:00] Bob: We should use the new process.
\`\`\`

### D2
- decision_id: decision-2
- owner: Cara
- confidence: high
- score: 8

Defer the launch

\`\`\`text
- [00:03:00] Cara: Defer the launch.
\`\`\``,
    ),
  );

  assert.equal(parsed.actions.length, 1);
  assert.equal(parsed.decisions.length, 2);
  assert.deepEqual(parsed.actions[0], {
    kind: "action",
    assertionId: null,
    reviewStatus: "needs_review",
    label: "C1",
    id: "action-1",
    status: "needs_review",
    taskId: null,
    detailsRef: null,
    owner: null,
    assignee: "Alice",
    confidence: "high",
    score: 7,
    dueDate: null,
    dueText: null,
    summary: "Alice to follow up with the team",
    evidence: "- [00:01:00] Bob: Before. > [00:01:05] Alice: I will follow up. - [00:01:08] Bob: Thanks.",
    evidenceTimestamps: ["00:01:00", "00:01:05", "00:01:08"],
    evidenceTargetTime: "00:01:05",
  });
  assert.equal(parsed.decisions[0].label, "D1");
  assert.equal(parsed.decisions[1].id, "decision-2");
});

test("parseMeetingReviewSections handles no actions and one decision", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      "- None extracted.",
      `### D1
- decision_id: decision-1
- owner: Bob
- confidence: high
- score: 6

Keep the current plan

\`\`\`text
- [00:10:00] Bob: Keep the current plan.
\`\`\``,
    ),
  );

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 1);
  assert.equal(parsed.decisions[0].summary, "Keep the current plan");
});

test("parseMeetingReviewSections handles managed sections with none extracted", () => {
  const parsed = parseMeetingReviewSections(markdownWithSections("- None extracted.", "- None extracted."));

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 0);
});

test("parseMeetingReviewSections prefers the quoted evidence timestamp", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      `### C1
- action_id: action-1
- status: needs_review
- assignee: Alice
- confidence: high
- score: 7

Alice to send notes

\`\`\`text
- [00:04:00] Bob: First timestamp.
> [00:04:12] Alice: I will send notes.
- [00:04:30] Bob: Later timestamp.
\`\`\``,
      "- None extracted.",
    ),
  );

  assert.deepEqual(parsed.actions[0].evidenceTimestamps, ["00:04:00", "00:04:12", "00:04:30"]);
  assert.equal(parsed.actions[0].evidenceTargetTime, "00:04:12");
});

test("parseMeetingReviewSections handles legacy transcript-only meetings", () => {
  const parsed = parseMeetingReviewSections(`# Legacy

## Transcript
\`\`\`text
[00:00:01] A: Hello.
\`\`\`
`);

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 0);
});

function fullMeetingMarkdown(title: string, recordingId: string, meetingDay: string) {
  return `---
source: fathom
note_type: meeting_transcript
page_schema_version: 2
recording_id: "${recordingId}"
meeting_title: "${title}"
meeting_date: "${meetingDay}T07:00:00Z"
meeting_day: "${meetingDay}"
meeting_month: "${meetingDay.slice(0, 7)}"
playback_url: "https://fathom.video/calls/${recordingId}"
participants:
  - "Alice"
  - "Bob"
---

# ${title}

<!-- FATHOM:SECTION metadata:start -->
## Meeting Metadata
- source: fathom
- recording_id: ${recordingId}
- meeting_date: ${meetingDay}T07:00:00Z
- playback_url: https://fathom.video/calls/${recordingId}
<!-- FATHOM:SECTION metadata:end -->

<!-- FATHOM:SECTION participants:start -->
## Participants
- Alice
- Bob
<!-- FATHOM:SECTION participants:end -->

<!-- FATHOM:SECTION actions:start -->
## Actions
### C1
- action_id: action-${recordingId}
- status: needs_review
- task_id: task-${recordingId}
- details_ref: [[Tasks/Details/${recordingId}#C1]]
- assignee: Alice
- confidence: high
- score: 7

Alice to follow up

\`\`\`text
- [00:01:00] Bob: Before.
> [00:01:05] Alice: I will follow up.
\`\`\`
<!-- FATHOM:SECTION actions:end -->

<!-- FATHOM:SECTION decisions:start -->
## Decisions
### D1
- decision_id: decision-${recordingId}
- details_ref: [[Tasks/Details/${recordingId}#D1]]
- owner: Bob
- confidence: medium
- score: 5

Use the new process

\`\`\`text
- [00:02:00] Bob: We should use the new process.
\`\`\`
<!-- FATHOM:SECTION decisions:end -->

<!-- FATHOM:SECTION transcript:start -->
## Transcript
\`\`\`text
[00:00:01] Bob: Hello.
[00:01:05] Alice: I will follow up.
[00:02:00] Bob: We should use the new process.
\`\`\`
<!-- FATHOM:SECTION transcript:end -->
`;
}

function writeMeeting(rootDir: string, fileName: string, title: string, recordingId: string, meetingDay: string) {
  const filePath = path.join(rootDir, fileName);
  writeFileSync(filePath, fullMeetingMarkdown(title, recordingId, meetingDay), "utf8");
  return filePath;
}

test("loadMeetingIndexWithOptions uses db-backed metadata when parity passes in auto mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-web-meetings-"));
  writeFileSync(
    path.join(root, "Index.md"),
    `# Fathom Meeting Transcript Index\n\n- generated_at: 2026-05-31T00:00:00.000Z\n- transcript_count: 2\n`,
    "utf8",
  );
  const firstMeetingPath = writeMeeting(root, "2026-05-26-fathom-recording-149332762.md", "Kickoff", "149332762", "2026-05-26");
  const secondMeetingPath = writeMeeting(root, "2026-05-27-fathom-recording-149750630.md", "Weekly", "149750630", "2026-05-27");
  const dbPath = path.join(root, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  ingestMeetingNoteFile(db, firstMeetingPath, { ingestedAt: "2026-05-31T00:00:00.000Z" });
  ingestMeetingNoteFile(db, secondMeetingPath, { ingestedAt: "2026-05-31T00:01:00.000Z" });
  db.prepare(`UPDATE action_assertions SET review_status = 'imported' WHERE meeting_id IS NOT NULL;`).run();

  const markdownIndex = loadMeetingIndexFromMarkdownRoot(root);
  const resolvedIndex = loadMeetingIndexWithOptions({ rootDir: root, dbPath, sourceMode: "auto" });
  assert.equal(resolvedIndex.meetings.length, markdownIndex.meetings.length);
  assert.deepEqual(
    resolvedIndex.meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      actionCount: meeting.actionCount,
      decisionCount: meeting.decisionCount,
      recordingId: meeting.recordingId,
    })),
    markdownIndex.meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      actionCount: meeting.actionCount,
      decisionCount: meeting.decisionCount,
      recordingId: meeting.recordingId,
    })),
  );

  const detail = loadMeetingDetailWithOptions("2026-05-27-fathom-recording-149750630", { rootDir: root, dbPath, sourceMode: "auto" });
  assert.equal(detail?.actions[0].taskId, "task-149750630");
  assert.match(detail?.actions[0].assertionId ?? "", /^action_assertion_/u);
  assert.equal(detail?.actions[0].reviewStatus, "needs_review");
  assert.equal(detail?.decisions[0].detailsRef, "[[Tasks/Details/149750630#D1]]");
  assert.match(detail?.decisions[0].assertionId ?? "", /^decision_assertion_/u);
  assert.equal(detail?.decisions[0].reviewStatus, "needs_review");
  assert.equal(detail?.lines.length, 3);
  assert.equal(detail?.rawText, null);
});

test("loadMeetingIndexWithOptions falls back to markdown when db parity fails in auto mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-web-meetings-fallback-"));
  writeFileSync(
    path.join(root, "Index.md"),
    `# Fathom Meeting Transcript Index\n\n- generated_at: 2026-05-31T00:00:00.000Z\n- transcript_count: 1\n`,
    "utf8",
  );
  const meetingPath = writeMeeting(root, "2026-05-26-fathom-recording-149332762.md", "Kickoff", "149332762", "2026-05-26");
  const dbPath = path.join(root, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  ingestMeetingNoteFile(db, meetingPath, { ingestedAt: "2026-05-31T00:00:00.000Z" });
  db.prepare(`UPDATE meetings SET title = 'Broken DB title' WHERE meeting_id IS NOT NULL;`).run();

  const resolvedIndex = loadMeetingIndexWithOptions({ rootDir: root, dbPath, sourceMode: "auto" });
  assert.equal(resolvedIndex.meetings[0]?.title, "Kickoff");
});
