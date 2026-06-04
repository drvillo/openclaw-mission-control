import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  acceptMeetingAssertions,
  countRows,
  isActionWorkflowStatus,
  markActionAssertionDone,
  openMissionControlDb,
  reassignActionAssertion,
  rejectMeetingAssertions,
  updateActionAssertionStatus,
} from "@ocmc/db";
import { handleIngestMeetingsRequest } from "./ingestion-api";
import { backfillMeetingNotes, buildMeetingIngestionPayload, ingestMeetingNoteFile, ingestMeetingNotePath } from "./meetings-ingestion";

const FENCE = "```";
const SAMPLE_MEETING = `---
source: fathom
note_type: meeting_transcript
page_schema_version: 2
recording_id: "149332762"
meeting_title: "LR Mining Kick off"
meeting_date: "2026-05-26T07:00:00Z"
meeting_day: "2026-05-26"
meeting_month: "2026-05"
playback_url: "https://fathom.video/calls/686033014"
participants:
  - "Ferran Lemus"
  - "Francesco Vivoli"
participant_keys:
  - "ferran-lemus"
  - "francesco-vivoli"
---

# LR Mining Kick off

<!-- FATHOM:SECTION metadata:start -->
## Meeting Metadata
- source: fathom
- recording_id: 149332762
- meeting_date: 2026-05-26T07:00:00Z
- playback_url: https://fathom.video/calls/686033014
- share_url: https://fathom.video/share/xVe6sZ3K7j6oQzFvsuGenNnFtdp4JyFv
<!-- FATHOM:SECTION metadata:end -->

<!-- FATHOM:SECTION participants:start -->
## Participants
- Ferran Lemus
- Francesco Vivoli
<!-- FATHOM:SECTION participants:end -->

<!-- FATHOM:SECTION actions:start -->
## Actions
### C1
- action_id: action-c34a23e62e77ea2b
- status: needs_review
- task_id: task-20260526-001
- details_ref: [[Tasks/Details/mining-kickoff#C1]]
- assignee: Francesco Vivoli
- confidence: high
- score: 6

Francesco Vivoli to add Kenobi Nakomoto to the BBG Signal group

${FENCE}text
- [00:30:41] Francesco Vivoli: Go ahead.
> [00:30:43] Francesco Vivoli: I'll add you now and we'll clarify.
${FENCE}
<!-- FATHOM:SECTION actions:end -->

<!-- FATHOM:SECTION decisions:start -->
## Decisions
### D1
- decision_id: decision-a549e0def36710cb
- details_ref: [[Tasks/Details/mining-kickoff#D1]]
- owner: Francesco Vivoli
- confidence: high
- score: 6

Proceed with the BTSF loan discussion and defer equity for now

${FENCE}text
- [00:28:37] Francesco Vivoli: So Mark spoke with them.
${FENCE}
<!-- FATHOM:SECTION decisions:end -->

<!-- FATHOM:SECTION transcript:start -->
## Transcript
${FENCE}text
[00:28:37] Francesco Vivoli: So Mark spoke with them.
[00:30:41] Francesco Vivoli: Go ahead.
[00:30:43] Francesco Vivoli: I'll add you now and we'll clarify.
${FENCE}
<!-- FATHOM:SECTION transcript:end -->

<!-- FATHOM:SECTION provenance:start -->
## Processing Provenance
- run_id: R-20260529-131217
- processed_at: 2026-05-29T13:12:17.127597+00:00
- flow_id: manual-last-2-weeks-backfill-20260529
- recording_id: 149332762
- page_match_strategy: canonical_existing
- extractor: llm
- model_used: openai-codex/gpt-5.4-mini
- prompt_hash: e5aad73a5696978f9e04da043294e2558fcc74f6189ae4948d95b1778fb7b4b8
- transcript_sha256: cc9279b7c00f17f702528c49d0cd44521ca1368112a5069ecb4895a17a0161fc
- delivery_status: skipped_disabled
<!-- FATHOM:SECTION provenance:end -->
`;

test("buildMeetingIngestionPayload parses current Obsidian meeting format", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-payload-"));
  const meetingPath = path.join(root, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");

  const payload = buildMeetingIngestionPayload(meetingPath, SAMPLE_MEETING, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });

  assert.equal(payload.sourceType, "fathom");
  assert.equal(payload.meeting.title, "LR Mining Kick off");
  assert.equal(payload.meeting.recordingId, "149332762");
  assert.equal(payload.participants.length, 2);
  assert.equal(payload.participants[0].participantKey, "ferran-lemus");
  assert.equal(payload.transcriptSegments.length, 3);
  assert.equal(payload.actions.length, 1);
  assert.equal(payload.actions[0].taskId, "task-20260526-001");
  assert.equal(payload.actions[0].detailsRef, "[[Tasks/Details/mining-kickoff#C1]]");
  assert.equal(payload.actions[0].reviewStatus, "needs_review");
  assert.equal(payload.actions[0].evidenceLinks?.[0].timestamp, "00:30:41");
  assert.equal(payload.decisions.length, 1);
  assert.equal(payload.decisions[0].detailsRef, "[[Tasks/Details/mining-kickoff#D1]]");
  assert.equal(payload.decisions[0].reviewStatus, "needs_review");
  assert.equal(payload.extractionRun.providerRunId, "R-20260529-131217");
  assert.match(payload.contentHash, /^[a-f0-9]{64}$/u);
});

test("ingestMeetingNoteFile stores immutable versions and is idempotent by path plus content hash", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-ingest-"));
  const vault = path.join(root, "vault");
  mkdirSync(vault, { recursive: true });
  const meetingPath = path.join(vault, "2026-05-26-fathom-recording-149332762.md");
  const dbPath = path.join(root, "mission-control.sqlite");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");

  const db = openMissionControlDb(dbPath);
  const first = ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });

  assert.equal(first.status, "ingested");
  assert.equal(countRows(db, "source_documents"), 1);
  assert.equal(countRows(db, "document_versions"), 1);
  assert.equal(countRows(db, "meetings"), 1);
  assert.equal(countRows(db, "meeting_participants"), 2);
  assert.equal(countRows(db, "transcript_segments"), 3);
  assert.equal(countRows(db, "action_assertions"), 1);
  assert.equal(countRows(db, "decision_assertions"), 1);
  assert.equal(countRows(db, "evidence_links"), 3);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 1);

  const noop = ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:05:00.000Z",
  });
  assert.equal(noop.status, "noop");
  assert.equal(countRows(db, "document_versions"), 1);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 2);

  const updatedMeeting = readFileSync(meetingPath, "utf8").replace(
    "Francesco Vivoli to add Kenobi Nakomoto to the BBG Signal group",
    "Francesco Vivoli to add Kenobi Nakomoto to the BTSF Signal group",
  );
  writeFileSync(meetingPath, updatedMeeting, "utf8");

  const second = ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T01:00:00.000Z",
    ingestedAt: "2026-05-31T00:10:00.000Z",
  });
  assert.equal(second.status, "ingested");
  assert.equal(countRows(db, "document_versions"), 2);
  assert.equal(countRows(db, "action_assertions"), 2);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 3);

  const meetingRow = db.prepare(`
    SELECT current_document_version_id as currentDocumentVersionId, action_count as actionCount
    FROM meetings
    LIMIT 1;
  `).get() as { currentDocumentVersionId?: string; actionCount?: number } | undefined;
  assert.equal(meetingRow?.currentDocumentVersionId, second.documentVersionId);
  assert.equal(meetingRow?.actionCount, 1);

  const summaryRow = db.prepare(`
    SELECT summary, task_id as taskId, details_ref as detailsRef
    FROM action_assertions
    WHERE document_version_id = ?
    LIMIT 1;
  `).get(second.documentVersionId) as { summary?: string; taskId?: string; detailsRef?: string } | undefined;
  assert.match(summaryRow?.summary ?? "", /BTSF Signal group/u);
  assert.equal(summaryRow?.taskId, "task-20260526-001");
  assert.equal(summaryRow?.detailsRef, "[[Tasks/Details/mining-kickoff#C1]]");
});

test("noop ingestion repairs missing legacy action assertions from stored meeting notes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-repair-"));
  const vault = path.join(root, "vault");
  mkdirSync(vault, { recursive: true });
  const meetingPath = path.join(vault, "2026-06-04-fathom-recording-152153965.md");
  const legacyMeeting = SAMPLE_MEETING
    .replaceAll("LR Mining Kick off", "FV - Robert Weekly Meeting")
    .replaceAll("149332762", "152153965")
    .replace("- status: needs_review", "- status: created")
    .replaceAll("task-20260526-001", "task-20260604-001")
    .replaceAll("[[Tasks/Details/mining-kickoff#C1]]", "[[Tasks/Details/task-20260604-001-fathom-152153965-hold-off-on-github-vercel-transfer]]")
    .replace(
      "Francesco Vivoli to add Kenobi Nakomoto to the BBG Signal group",
      "Francesco Vivoli to hold off on GitHub/Vercel transfer",
    );
  writeFileSync(meetingPath, legacyMeeting, "utf8");

  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  const first = ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-06-04T08:18:59.000Z",
    ingestedAt: "2026-06-04T08:20:00.000Z",
  });
  assert.equal(first.status, "ingested");
  assert.equal(countRows(db, "action_assertions"), 1);

  const actionRow = db.prepare(`
    SELECT action_assertion_id as assertionId
    FROM action_assertions
    LIMIT 1;
  `).get() as { assertionId?: string } | undefined;
  db.exec("BEGIN;");
  db.prepare(`DELETE FROM evidence_links WHERE assertion_kind = 'action' AND assertion_id = ?;`).run(actionRow?.assertionId ?? "");
  db.prepare(`DELETE FROM action_assertions WHERE action_assertion_id = ?;`).run(actionRow?.assertionId ?? "");
  db.prepare(`UPDATE meetings SET action_count = 0 WHERE meeting_id = ?;`).run(first.meetingId);
  db.exec("COMMIT;");
  assert.equal(countRows(db, "action_assertions"), 0);

  const repaired = ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-06-04T08:18:59.000Z",
    ingestedAt: "2026-06-04T08:25:00.000Z",
  });
  assert.equal(repaired.status, "noop");
  assert.equal(countRows(db, "document_versions"), 1);
  assert.equal(countRows(db, "action_assertions"), 1);

  const repairedAction = db.prepare(`
    SELECT status, task_id as taskId, details_ref as detailsRef, review_status as reviewStatus, summary
    FROM action_assertions
    LIMIT 1;
  `).get() as { status?: string; taskId?: string; detailsRef?: string; reviewStatus?: string; summary?: string } | undefined;
  assert.equal(repairedAction?.status, "created");
  assert.equal(repairedAction?.taskId, "task-20260604-001");
  assert.equal(repairedAction?.detailsRef, "[[Tasks/Details/task-20260604-001-fathom-152153965-hold-off-on-github-vercel-transfer]]");
  assert.equal(repairedAction?.reviewStatus, "needs_review");
  assert.match(repairedAction?.summary ?? "", /hold off on GitHub\/Vercel transfer/u);

  const meetingRow = db.prepare(`
    SELECT action_count as actionCount, decision_count as decisionCount
    FROM meetings
    WHERE meeting_id = ?;
  `).get(first.meetingId) as { actionCount?: number; decisionCount?: number } | undefined;
  assert.equal(meetingRow?.actionCount, 1);
  assert.equal(meetingRow?.decisionCount, 1);
  const runMessage = db.prepare(`
    SELECT message
    FROM meeting_ingestion_runs
    ORDER BY started_at DESC
    LIMIT 1;
  `).get() as { message?: string } | undefined;
  assert.match(runMessage?.message ?? "", /repaired assertions actions=1 decisions=0/u);
});

test("meeting assertion review accepts pending rows and rejects rows destructively", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-review-"));
  const vault = path.join(root, "vault");
  mkdirSync(vault, { recursive: true });
  const meetingPath = path.join(vault, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });

  const action = db.prepare(`
    SELECT action_assertion_id as assertionId, review_status as reviewStatus
    FROM action_assertions
    LIMIT 1;
  `).get() as { assertionId: string; reviewStatus: string } | undefined;
  const decision = db.prepare(`
    SELECT decision_assertion_id as assertionId, review_status as reviewStatus
    FROM decision_assertions
    LIMIT 1;
  `).get() as { assertionId: string; reviewStatus: string } | undefined;
  assert.equal(action?.reviewStatus, "needs_review");
  assert.equal(decision?.reviewStatus, "needs_review");

  const accepted = acceptMeetingAssertions(db, [{ kind: "action", assertionId: action?.assertionId ?? "" }]);
  assert.deepEqual(accepted, { accepted: 1, rejected: 0 });
  assert.equal(
    (db.prepare(`SELECT review_status as reviewStatus FROM action_assertions WHERE action_assertion_id = ?;`).get(action?.assertionId) as { reviewStatus?: string } | undefined)?.reviewStatus,
    "accepted",
  );

  const rejected = rejectMeetingAssertions(db, [{ kind: "decision", assertionId: decision?.assertionId ?? "" }]);
  assert.deepEqual(rejected, { accepted: 0, rejected: 1 });
  assert.equal(countRows(db, "decision_assertions"), 0);
  assert.equal(countRows(db, "evidence_links"), 2);
  const meetingRow = db.prepare(`
    SELECT action_count as actionCount, decision_count as decisionCount
    FROM meetings
    LIMIT 1;
  `).get() as { actionCount?: number; decisionCount?: number } | undefined;
  assert.equal(meetingRow?.actionCount, 1);
  assert.equal(meetingRow?.decisionCount, 0);
});

test("action assertion workflow validates statuses and marks pending actions done", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-action-workflow-"));
  const vault = path.join(root, "vault");
  mkdirSync(vault, { recursive: true });
  const meetingPath = path.join(vault, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });

  const action = db.prepare(`
    SELECT action_assertion_id as assertionId, review_status as reviewStatus, status
    FROM action_assertions
    LIMIT 1;
  `).get() as { assertionId: string; reviewStatus: string; status: string | null } | undefined;
  assert.equal(action?.reviewStatus, "needs_review");
  assert.equal(isActionWorkflowStatus("blocked"), false);
  assert.equal(isActionWorkflowStatus("next"), true);

  assert.throws(() => updateActionAssertionStatus(db, action?.assertionId ?? "", "blocked" as never), /Action status must be/u);
  const marked = markActionAssertionDone(db, action?.assertionId ?? "");
  assert.deepEqual(marked, { updated: 1, status: "done" });

  const row = db.prepare(`
    SELECT review_status as reviewStatus, status
    FROM action_assertions
    WHERE action_assertion_id = ?;
  `).get(action?.assertionId) as { reviewStatus?: string; status?: string } | undefined;
  assert.equal(row?.reviewStatus, "accepted");
  assert.equal(row?.status, "done");
});

test("action assertion workflow updates accepted status and supports reassignment", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-action-reassign-"));
  const vault = path.join(root, "vault");
  mkdirSync(vault, { recursive: true });
  const meetingPath = path.join(vault, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));
  ingestMeetingNoteFile(db, meetingPath, {
    capturedAt: "2026-05-30T00:00:00.000Z",
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });

  const action = db.prepare(`
    SELECT action_assertion_id as assertionId
    FROM action_assertions
    LIMIT 1;
  `).get() as { assertionId: string } | undefined;
  assert.ok(action?.assertionId);

  acceptMeetingAssertions(db, [{ kind: "action", assertionId: action.assertionId }]);
  assert.deepEqual(updateActionAssertionStatus(db, action.assertionId, "in_progress"), { updated: 1, status: "in_progress" });
  assert.deepEqual(reassignActionAssertion(db, action.assertionId, "Alice Example"), { reassigned: 1 });

  const row = db.prepare(`
    SELECT review_status as reviewStatus, status, raw_assignee as rawAssignee
    FROM action_assertions
    WHERE action_assertion_id = ?;
  `).get(action.assertionId) as { reviewStatus?: string; status?: string; rawAssignee?: string } | undefined;
  assert.equal(row?.reviewStatus, "accepted");
  assert.equal(row?.status, "in_progress");
  assert.equal(row?.rawAssignee, "Alice Example");
});

test("ingestMeetingNotePath resolves vault-relative paths and records missing notes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-service-"));
  const vault = path.join(root, "vault");
  const fathomRoot = path.join(vault, "Meeting Recordings", "Fathom");
  mkdirSync(fathomRoot, { recursive: true });
  const meetingPath = path.join(fathomRoot, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));

  const first = ingestMeetingNotePath(db, "Meeting Recordings/Fathom/2026-05-26-fathom-recording-149332762.md", {
    vaultRoot: vault,
    allowedRoot: fathomRoot,
    ingestedAt: "2026-05-31T00:00:00.000Z",
  });
  assert.equal(first.status, "ingested");
  assert.equal(first.canonicalSourcePath, "Meeting Recordings/Fathom/2026-05-26-fathom-recording-149332762.md");
  assert.equal(first.transcriptSegmentCount, 3);

  const noop = ingestMeetingNotePath(db, meetingPath, {
    vaultRoot: vault,
    allowedRoot: fathomRoot,
    ingestedAt: "2026-05-31T00:05:00.000Z",
  });
  assert.equal(noop.status, "noop");
  assert.equal(countRows(db, "document_versions"), 1);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 2);

  const missing = ingestMeetingNotePath(db, "Meeting Recordings/Fathom/missing.md", {
    vaultRoot: vault,
    allowedRoot: fathomRoot,
    ingestedAt: "2026-05-31T00:10:00.000Z",
  });
  assert.equal(missing.status, "failed");
  assert.equal(missing.errorKind, "not_found");
  assert.match(missing.ingestionRunId ?? "", /^ingestion_run_/u);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 3);
});

test("ingestMeetingNotePath rejects traversal and non-markdown paths before DB writes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-service-invalid-"));
  const vault = path.join(root, "vault");
  const fathomRoot = path.join(vault, "Meeting Recordings", "Fathom");
  mkdirSync(path.join(vault, "Meeting Recordings"), { recursive: true });
  mkdirSync(fathomRoot, { recursive: true });
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));

  const traversal = ingestMeetingNotePath(db, "Meeting Recordings/Fathom/../outside.md", {
    vaultRoot: vault,
    allowedRoot: fathomRoot,
  });
  assert.equal(traversal.status, "failed");
  assert.equal(traversal.errorKind, "invalid_path");

  const textFile = ingestMeetingNotePath(db, "Meeting Recordings/Fathom/note.txt", {
    vaultRoot: vault,
    allowedRoot: fathomRoot,
  });
  assert.equal(textFile.status, "failed");
  assert.equal(textFile.errorKind, "invalid_path");
  assert.equal(countRows(db, "meeting_ingestion_runs"), 0);
});

test("handleIngestMeetingsRequest maps success, auth, missing, and invalid paths to JSON responses", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-api-"));
  const vault = path.join(root, "vault");
  const fathomRoot = path.join(vault, "Meeting Recordings", "Fathom");
  mkdirSync(fathomRoot, { recursive: true });
  const meetingPath = path.join(fathomRoot, "2026-05-26-fathom-recording-149332762.md");
  writeFileSync(meetingPath, SAMPLE_MEETING, "utf8");
  const dbPath = path.join(root, "mission-control.sqlite");

  const unauthorized = await handleIngestMeetingsRequest(
    { sourcePath: "Meeting Recordings/Fathom/2026-05-26-fathom-recording-149332762.md" },
    {},
    { dbPath, vaultRoot: vault, allowedRoot: fathomRoot, token: "secret" },
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.ok, false);

  const first = await handleIngestMeetingsRequest(
    { sourcePath: "Meeting Recordings/Fathom/2026-05-26-fathom-recording-149332762.md" },
    { authorization: "Bearer secret" },
    { dbPath, vaultRoot: vault, allowedRoot: fathomRoot, token: "secret", ingestedAt: "2026-05-31T00:00:00.000Z" },
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.payload?.status, "ingested");
  assert.equal(first.body.payload?.canonicalSourcePath, "Meeting Recordings/Fathom/2026-05-26-fathom-recording-149332762.md");

  const noop = await handleIngestMeetingsRequest(
    { sourcePath: meetingPath },
    {},
    { dbPath, vaultRoot: vault, allowedRoot: fathomRoot, ingestedAt: "2026-05-31T00:05:00.000Z" },
  );
  assert.equal(noop.status, 200);
  assert.equal(noop.body.payload?.status, "noop");

  const missing = await handleIngestMeetingsRequest(
    { sourcePath: "Meeting Recordings/Fathom/missing.md" },
    {},
    { dbPath, vaultRoot: vault, allowedRoot: fathomRoot },
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.ok, false);
  assert.equal(missing.body.payload?.status, "failed");

  const invalid = await handleIngestMeetingsRequest(
    { sourcePath: "Meeting Recordings/Fathom/../outside.md" },
    {},
    { dbPath, vaultRoot: vault, allowedRoot: fathomRoot },
  );
  assert.equal(invalid.status, 400);
});

function writeMeeting(root: string, fileName: string, title: string, recordingId: string) {
  const filePath = path.join(root, fileName);
  const content = SAMPLE_MEETING
    .replaceAll("LR Mining Kick off", title)
    .replaceAll("149332762", recordingId)
    .replaceAll("task-20260526-001", `task-${recordingId}`)
    .replaceAll("[[Tasks/Details/mining-kickoff#C1]]", `[[Tasks/Details/${recordingId}#C1]]`)
    .replaceAll("[[Tasks/Details/mining-kickoff#D1]]", `[[Tasks/Details/${recordingId}#D1]]`);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("backfillMeetingNotes is re-runnable, continues on failure, and reconciles current items", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-backfill-"));
  const vault = path.join(root, "Meeting Recordings", "Fathom");
  mkdirSync(vault, { recursive: true });
  const firstMeeting = writeMeeting(vault, "2026-05-26-fathom-recording-149332762.md", "LR Mining Kick off", "149332762");
  const secondMeeting = writeMeeting(vault, "2026-05-27-fathom-recording-149750630.md", "Chainlabs weekly", "149750630");
  const missingMeeting = path.join(vault, "2026-05-28-fathom-recording-missing.md");
  const db = openMissionControlDb(path.join(root, "mission-control.sqlite"));

  const first = backfillMeetingNotes(db, {
    rootDir: vault,
    filePaths: [firstMeeting, secondMeeting, missingMeeting],
    startedAt: "2026-05-31T00:00:00.000Z",
  });

  assert.deepEqual(first.totals, {
    discovered: 3,
    processed: 3,
    ingested: 2,
    noop: 0,
    failed: 1,
  });
  assert.equal(first.reconciliation.markdown.meetings, 2);
  assert.equal(first.reconciliation.db.meetings, 2);
  assert.equal(first.reconciliation.db.failedRuns, 1);
  assert.deepEqual(first.reconciliation.mismatches, []);
  assert.equal(countRows(db, "meetings"), 2);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 3);

  const failedRow = db.prepare(`
    SELECT status, canonical_source_path as canonicalSourcePath, message
    FROM meeting_ingestion_runs
    WHERE status = 'failed'
    LIMIT 1;
  `).get() as { status?: string; canonicalSourcePath?: string; message?: string } | undefined;
  assert.equal(failedRow?.status, "failed");
  assert.equal(failedRow?.canonicalSourcePath, "Meeting Recordings/Fathom/2026-05-28-fathom-recording-missing.md");
  assert.match(failedRow?.message ?? "", /not found/u);

  const second = backfillMeetingNotes(db, {
    rootDir: vault,
    filePaths: [firstMeeting, secondMeeting],
    startedAt: "2026-05-31T00:10:00.000Z",
  });
  assert.deepEqual(second.totals, {
    discovered: 2,
    processed: 2,
    ingested: 0,
    noop: 2,
    failed: 0,
  });
  assert.deepEqual(second.reconciliation.mismatches, []);
  assert.equal(countRows(db, "document_versions"), 2);
  assert.equal(countRows(db, "meeting_ingestion_runs"), 5);
});

test("openMissionControlDb keeps existing rows while applying additive meeting schema changes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ocmc-meeting-migrate-"));
  const dbPath = path.join(root, "mission-control.sqlite");
  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`
    CREATE TABLE runtime_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
    INSERT INTO runtime_tasks (task_id, status, recorded_at, raw_json)
    VALUES ('legacy-task', 'running', '2026-05-31T00:00:00.000Z', '{}');
  `);
  legacyDb.close();

  const migrated = openMissionControlDb(dbPath);
  const taskRow = migrated.prepare(`
    SELECT task_id as taskId, status, terminal_outcome as terminalOutcome
    FROM runtime_tasks
    WHERE task_id = 'legacy-task';
  `).get() as { taskId?: string; status?: string; terminalOutcome?: string | null } | undefined;
  assert.equal(taskRow?.taskId, "legacy-task");
  assert.equal(taskRow?.status, "running");
  assert.equal(taskRow?.terminalOutcome ?? null, null);
  assert.equal(countRows(migrated, "meetings"), 0);

  const actionColumns = migrated.prepare(`PRAGMA table_info(action_assertions);`).all() as Array<{ name?: string }>;
  const decisionColumns = migrated.prepare(`PRAGMA table_info(decision_assertions);`).all() as Array<{ name?: string }>;
  assert(actionColumns.some((column) => column.name === "task_id"));
  assert(actionColumns.some((column) => column.name === "details_ref"));
  assert(decisionColumns.some((column) => column.name === "task_id"));
  assert(decisionColumns.some((column) => column.name === "details_ref"));
});
