import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeMeetingReviewStatus,
  parseMeetingMarkdown,
  parseMeetingReviewSections,
  type MeetingReviewItem,
  type MeetingTranscriptLine,
} from "@ocmc/shared";
import { FATHOM_RECORDINGS_ROOT, MISSION_CONTROL_DB_PATH, MISSION_CONTROL_MEETINGS_SOURCE } from "./config";

export type { MeetingReviewItem, MeetingTranscriptLine };

export type MeetingRecording = {
  id: string;
  title: string;
  date: string;
  dateTime: string | null;
  month: string;
  participants: string[];
  recordingId: string;
  playbackUrl: string | null;
  generatedAt: string | null;
  filePath: string;
  obsidianRef: string;
  actions: MeetingReviewItem[];
  decisions: MeetingReviewItem[];
  actionCount: number;
  decisionCount: number;
};

export type MeetingIndex = {
  root: string;
  generatedAt: string | null;
  transcriptCount: number;
  meetings: MeetingRecording[];
  participants: string[];
  months: string[];
};

export type MeetingDetail = {
  id: string;
  title: string;
  dateTime: string | null;
  participants: string[];
  playbackUrl: string | null;
  obsidianRef: string;
  actions: MeetingReviewItem[];
  decisions: MeetingReviewItem[];
  actionCount: number;
  decisionCount: number;
  lines: MeetingTranscriptLine[];
  rawText: string | null;
};

export type MeetingTranscript = MeetingDetail;
export type MeetingSourceMode = "markdown" | "db" | "auto";
export type MeetingLoaderOptions = {
  rootDir?: string;
  dbPath?: string;
  sourceMode?: MeetingSourceMode;
};

type ResolvedMeetingIndex = {
  source: "markdown" | "db";
  index: MeetingIndex;
};

type DbMeetingRow = {
  meetingId: string;
  title: string;
  startedAt: string | null;
  meetingDay: string | null;
  meetingMonth: string | null;
  playbackUrl: string | null;
  recordingId: string | null;
  transcriptSourcePath: string;
  transcriptObsidianRef: string;
  participantCount: number;
  actionCount: number;
  decisionCount: number;
  generatedAt: string | null;
};

type DbParticipantRow = {
  meetingId: string;
  rawName: string;
};

type DbActionRow = {
  meetingId: string;
  actionAssertionId: string;
  externalAssertionId: string | null;
  reviewStatus: string | null;
  label: string;
  status: string | null;
  taskId: string | null;
  detailsRef: string | null;
  rawAssignee: string | null;
  dueDate: string | null;
  dueText: string | null;
  confidence: string | null;
  score: number | null;
  summary: string;
  evidenceText: string | null;
  evidenceTargetTime: string | null;
  sequence: number;
};

type DbDecisionRow = {
  meetingId: string;
  decisionAssertionId: string;
  externalAssertionId: string | null;
  reviewStatus: string | null;
  label: string;
  taskId: string | null;
  detailsRef: string | null;
  rawOwner: string | null;
  confidence: string | null;
  score: number | null;
  summary: string;
  evidenceText: string | null;
  evidenceTargetTime: string | null;
  sequence: number;
};

type DbEvidenceRow = {
  assertionId: string;
  timestamp: string;
  quoteText: string | null;
};

function readPrefix(filePath: string, maxBytes = 96_000) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(descriptor, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseBulletMetadata(text: string) {
  const metadata = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^- ([a-z_]+):\s*(.*)$/u);
    if (match) {
      metadata.set(match[1], match[2].trim());
    }
  }
  return metadata;
}

function parseDateFromFilename(fileName: string) {
  return fileName.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1] ?? "unknown";
}

function parseIndexMetadata(rootDir: string) {
  const indexPath = path.join(rootDir, "Index.md");
  if (!fs.existsSync(indexPath)) {
    return { generatedAt: null, transcriptCount: 0 };
  }
  try {
    const metadata = parseBulletMetadata(readPrefix(indexPath, 16_000));
    return {
      generatedAt: metadata.get("generated_at") ?? null,
      transcriptCount: Number(metadata.get("transcript_count") ?? 0) || 0,
    };
  } catch {
    return { generatedAt: null, transcriptCount: 0 };
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function listMeetingMarkdownFiles(rootDir: string) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "Index.md")
    .map((entry) => path.join(rootDir, entry.name));
}

function buildMeetingRecordingFromMarkdown(filePath: string): MeetingRecording | null {
  try {
    const text = readPrefix(filePath);
    const parsed = parseMeetingMarkdown(text);
    const stem = path.basename(filePath, ".md");
    const date = parsed.meetingDay ?? parsed.dateTime?.slice(0, 10) ?? parseDateFromFilename(path.basename(filePath));
    const recordingId = parsed.recordingId ?? path.basename(filePath).match(/fathom-recording-(.+)\.md$/u)?.[1] ?? stem;

    return {
      id: stem,
      title: parsed.title ?? stem,
      date,
      dateTime: parsed.dateTime,
      month: parsed.meetingMonth ?? date.slice(0, 7),
      participants: parsed.participants,
      recordingId,
      playbackUrl: parsed.playbackUrl,
      generatedAt: parsed.generatedAt,
      filePath,
      obsidianRef: `Meeting Recordings/Fathom/${stem}`,
      actions: parsed.actions,
      decisions: parsed.decisions,
      actionCount: parsed.actions.length,
      decisionCount: parsed.decisions.length,
    };
  } catch {
    return null;
  }
}

function buildMeetingIndex(rootDir: string, generatedAt: string | null, transcriptCount: number, meetings: MeetingRecording[]): MeetingIndex {
  return {
    root: rootDir,
    generatedAt,
    transcriptCount: transcriptCount || meetings.length,
    meetings,
    participants: uniqueSorted(meetings.flatMap((meeting) => meeting.participants)),
    months: [...new Set(meetings.map((meeting) => meeting.month))].sort((left, right) => right.localeCompare(left)),
  };
}

function sortMeetings(meetings: MeetingRecording[]) {
  return [...meetings].sort(
    (left, right) =>
      (right.dateTime ?? right.date).localeCompare(left.dateTime ?? left.date) ||
      right.recordingId.localeCompare(left.recordingId),
  );
}

function openMeetingsDb(dbPath: string): DatabaseSync | null {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
}

function queryRows<T>(db: DatabaseSync | null, sql: string): T[] {
  if (!db) {
    return [];
  }

  try {
    return db
      .prepare(sql)
      .all()
      .map((row) => ({ ...row })) as T[];
  } catch {
    return [];
  }
}

function groupRows<T extends { meetingId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    grouped.set(row.meetingId, [...(grouped.get(row.meetingId) ?? []), row]);
  }
  return grouped;
}

function groupEvidenceRows(rows: DbEvidenceRow[]) {
  const grouped = new Map<string, DbEvidenceRow[]>();
  for (const row of rows) {
    grouped.set(row.assertionId, [...(grouped.get(row.assertionId) ?? []), row]);
  }
  return grouped;
}

function buildReviewItemFromDbAction(row: DbActionRow, evidenceRows: DbEvidenceRow[]): MeetingReviewItem {
  return {
    kind: "action",
    assertionId: row.actionAssertionId,
    reviewStatus: normalizeMeetingReviewStatus(row.reviewStatus),
    label: row.label,
    id: row.externalAssertionId,
    status: row.status,
    taskId: row.taskId,
    detailsRef: row.detailsRef,
    owner: null,
    assignee: row.rawAssignee,
    confidence: row.confidence,
    score: row.score,
    dueDate: row.dueDate,
    dueText: row.dueText,
    summary: row.summary,
    evidence: row.evidenceText,
    evidenceTimestamps: evidenceRows.map((evidence) => evidence.timestamp),
    evidenceTargetTime: row.evidenceTargetTime,
  };
}

function buildReviewItemFromDbDecision(row: DbDecisionRow, evidenceRows: DbEvidenceRow[]): MeetingReviewItem {
  return {
    kind: "decision",
    assertionId: row.decisionAssertionId,
    reviewStatus: normalizeMeetingReviewStatus(row.reviewStatus),
    label: row.label,
    id: row.externalAssertionId,
    status: null,
    taskId: row.taskId,
    detailsRef: row.detailsRef,
    owner: row.rawOwner,
    assignee: null,
    confidence: row.confidence,
    score: row.score,
    dueDate: null,
    dueText: null,
    summary: row.summary,
    evidence: row.evidenceText,
    evidenceTimestamps: evidenceRows.map((evidence) => evidence.timestamp),
    evidenceTargetTime: row.evidenceTargetTime,
  };
}

export { parseMeetingReviewSections };

export function loadMeetingIndexFromMarkdownRoot(rootDir = FATHOM_RECORDINGS_ROOT): MeetingIndex {
  const indexMetadata = parseIndexMetadata(rootDir);
  const meetings = sortMeetings(
    listMeetingMarkdownFiles(rootDir)
      .map((filePath) => buildMeetingRecordingFromMarkdown(filePath))
      .filter((meeting): meeting is MeetingRecording => Boolean(meeting)),
  );

  return buildMeetingIndex(rootDir, indexMetadata.generatedAt, indexMetadata.transcriptCount, meetings);
}

export function loadMeetingIndexFromDbPath(dbPath = MISSION_CONTROL_DB_PATH, rootDir = FATHOM_RECORDINGS_ROOT): MeetingIndex | null {
  const db = openMeetingsDb(dbPath);
  if (!db) {
    return null;
  }

  const indexMetadata = parseIndexMetadata(rootDir);
  const meetingRows = queryRows<DbMeetingRow>(
    db,
    `SELECT
       m.meeting_id as meetingId,
       m.title as title,
       m.started_at as startedAt,
       m.meeting_day as meetingDay,
       m.meeting_month as meetingMonth,
       m.playback_url as playbackUrl,
       m.recording_id as recordingId,
       m.transcript_source_path as transcriptSourcePath,
       m.transcript_obsidian_ref as transcriptObsidianRef,
       m.participant_count as participantCount,
       m.action_count as actionCount,
       m.decision_count as decisionCount,
       COALESCE(er.processed_at, dv.processed_at) as generatedAt
     FROM meetings m
     LEFT JOIN document_versions dv ON dv.document_version_id = m.current_document_version_id
     LEFT JOIN extraction_runs er ON er.extraction_run_id = dv.extraction_run_id
     ORDER BY COALESCE(m.started_at, m.meeting_day, ''), COALESCE(m.recording_id, m.meeting_id);`,
  );

  if (meetingRows.length === 0) {
    return null;
  }

  const participantRows = queryRows<DbParticipantRow>(
    db,
    `SELECT mp.meeting_id as meetingId, mp.raw_name as rawName
     FROM meetings m
     JOIN meeting_participants mp
       ON mp.meeting_id = m.meeting_id
      AND mp.document_version_id = m.current_document_version_id
     ORDER BY mp.meeting_id, mp.sequence;`,
  );
  const actionRows = queryRows<DbActionRow>(
    db,
    `SELECT
       aa.meeting_id as meetingId,
       aa.action_assertion_id as actionAssertionId,
       aa.external_assertion_id as externalAssertionId,
       aa.review_status as reviewStatus,
       aa.label as label,
       aa.status as status,
       aa.task_id as taskId,
       aa.details_ref as detailsRef,
       aa.raw_assignee as rawAssignee,
       aa.due_date as dueDate,
       aa.due_text as dueText,
       aa.confidence as confidence,
       aa.score as score,
       aa.summary as summary,
       aa.evidence_text as evidenceText,
       aa.evidence_target_time as evidenceTargetTime,
       aa.sequence as sequence
     FROM meetings m
     JOIN action_assertions aa
       ON aa.meeting_id = m.meeting_id
      AND aa.document_version_id = m.current_document_version_id
     ORDER BY aa.meeting_id, aa.sequence;`,
  );
  const decisionRows = queryRows<DbDecisionRow>(
    db,
    `SELECT
       da.meeting_id as meetingId,
       da.decision_assertion_id as decisionAssertionId,
       da.external_assertion_id as externalAssertionId,
       da.review_status as reviewStatus,
       da.label as label,
       da.task_id as taskId,
       da.details_ref as detailsRef,
       da.raw_owner as rawOwner,
       da.confidence as confidence,
       da.score as score,
       da.summary as summary,
       da.evidence_text as evidenceText,
       da.evidence_target_time as evidenceTargetTime,
       da.sequence as sequence
     FROM meetings m
     JOIN decision_assertions da
       ON da.meeting_id = m.meeting_id
      AND da.document_version_id = m.current_document_version_id
     ORDER BY da.meeting_id, da.sequence;`,
  );
  const evidenceRows = queryRows<DbEvidenceRow>(
    db,
    `SELECT
       assertion_id as assertionId,
       timestamp as timestamp,
       quote_text as quoteText
     FROM evidence_links
     ORDER BY assertion_id, sequence;`,
  );

  const expectedParticipantCount = meetingRows.reduce((sum, row) => sum + row.participantCount, 0);
  const expectedActionCount = meetingRows.reduce((sum, row) => sum + row.actionCount, 0);
  const expectedDecisionCount = meetingRows.reduce((sum, row) => sum + row.decisionCount, 0);
  if ((expectedParticipantCount > 0 && participantRows.length < expectedParticipantCount) ||
      (expectedActionCount > 0 && actionRows.length < expectedActionCount) ||
      (expectedDecisionCount > 0 && decisionRows.length < expectedDecisionCount)) {
    return null;
  }

  const participantsByMeeting = groupRows(participantRows);
  const actionsByMeeting = groupRows(actionRows);
  const decisionsByMeeting = groupRows(decisionRows);
  const evidenceByAssertion = groupEvidenceRows(evidenceRows);

  const meetings = sortMeetings(
    meetingRows.map((row) => {
      const participants = (participantsByMeeting.get(row.meetingId) ?? []).map((participant) => participant.rawName);
      const actions = (actionsByMeeting.get(row.meetingId) ?? []).map((action) =>
        buildReviewItemFromDbAction(action, evidenceByAssertion.get(action.actionAssertionId) ?? []),
      );
      const decisions = (decisionsByMeeting.get(row.meetingId) ?? []).map((decision) =>
        buildReviewItemFromDbDecision(decision, evidenceByAssertion.get(decision.decisionAssertionId) ?? []),
      );
      const filePath = row.transcriptSourcePath;
      const id = path.basename(filePath, ".md");
      const date = row.meetingDay ?? row.startedAt?.slice(0, 10) ?? parseDateFromFilename(path.basename(filePath));

      return {
        id,
        title: row.title,
        date,
        dateTime: row.startedAt,
        month: row.meetingMonth ?? date.slice(0, 7),
        participants,
        recordingId: row.recordingId ?? id,
        playbackUrl: row.playbackUrl,
        generatedAt: row.generatedAt,
        filePath,
        obsidianRef: row.transcriptObsidianRef,
        actions,
        decisions,
        actionCount: row.actionCount,
        decisionCount: row.decisionCount,
      } satisfies MeetingRecording;
    }),
  );

  return buildMeetingIndex(
    rootDir,
    indexMetadata.generatedAt ?? meetings[0]?.generatedAt ?? null,
    Math.max(indexMetadata.transcriptCount, meetings.length),
    meetings,
  );
}

function reviewItemsAreEquivalent(left: MeetingReviewItem[], right: MeetingReviewItem[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const candidate = right[index];
    return Boolean(candidate) &&
      item.kind === candidate.kind &&
      item.label === candidate.label &&
      item.id === candidate.id &&
      item.status === candidate.status &&
      item.taskId === candidate.taskId &&
      item.detailsRef === candidate.detailsRef &&
      item.owner === candidate.owner &&
      item.assignee === candidate.assignee &&
      item.confidence === candidate.confidence &&
      item.score === candidate.score &&
      item.dueDate === candidate.dueDate &&
      item.dueText === candidate.dueText &&
      item.summary === candidate.summary &&
      item.evidence === candidate.evidence &&
      item.evidenceTargetTime === candidate.evidenceTargetTime &&
      JSON.stringify(item.evidenceTimestamps) === JSON.stringify(candidate.evidenceTimestamps);
  });
}

function meetingIndexesAreEquivalent(markdown: MeetingIndex, db: MeetingIndex) {
  if (markdown.meetings.length !== db.meetings.length) {
    return false;
  }

  const dbMeetingsById = new Map(db.meetings.map((meeting) => [meeting.id, meeting]));
  return markdown.meetings.every((meeting) => {
    const candidate = dbMeetingsById.get(meeting.id);
    if (!candidate) {
      return false;
    }
    return candidate.title === meeting.title &&
      candidate.date === meeting.date &&
      candidate.dateTime === meeting.dateTime &&
      candidate.month === meeting.month &&
      candidate.recordingId === meeting.recordingId &&
      candidate.playbackUrl === meeting.playbackUrl &&
      JSON.stringify(candidate.participants) === JSON.stringify(meeting.participants) &&
      candidate.actionCount === meeting.actionCount &&
      candidate.decisionCount === meeting.decisionCount &&
      reviewItemsAreEquivalent(candidate.actions, meeting.actions) &&
      reviewItemsAreEquivalent(candidate.decisions, meeting.decisions);
  });
}

function normalizeMeetingSourceMode(sourceMode: string | undefined): MeetingSourceMode {
  if (sourceMode === "db" || sourceMode === "auto") {
    return sourceMode;
  }
  return "markdown";
}

function resolveMeetingIndex(options: MeetingLoaderOptions = {}): ResolvedMeetingIndex {
  const rootDir = options.rootDir ?? FATHOM_RECORDINGS_ROOT;
  const dbPath = options.dbPath ?? MISSION_CONTROL_DB_PATH;
  const sourceMode = normalizeMeetingSourceMode(options.sourceMode ?? MISSION_CONTROL_MEETINGS_SOURCE);
  const markdownIndex = loadMeetingIndexFromMarkdownRoot(rootDir);

  if (sourceMode === "markdown") {
    return { source: "markdown", index: markdownIndex };
  }

  const dbIndex = loadMeetingIndexFromDbPath(dbPath, rootDir);
  if (!dbIndex) {
    return { source: "markdown", index: markdownIndex };
  }

  if (sourceMode === "db") {
    return { source: "db", index: dbIndex };
  }

  return meetingIndexesAreEquivalent(markdownIndex, dbIndex)
    ? { source: "db", index: dbIndex }
    : { source: "markdown", index: markdownIndex };
}

function loadMeetingDetailFromRecording(meeting: MeetingRecording): MeetingDetail | null {
  try {
    const parsed = parseMeetingMarkdown(fs.readFileSync(meeting.filePath, "utf8"));
    return {
      id: meeting.id,
      title: meeting.title,
      dateTime: meeting.dateTime,
      participants: meeting.participants,
      playbackUrl: meeting.playbackUrl,
      obsidianRef: meeting.obsidianRef,
      actions: meeting.actions,
      decisions: meeting.decisions,
      actionCount: meeting.actionCount,
      decisionCount: meeting.decisionCount,
      lines: parsed.transcriptLines,
      rawText: parsed.transcriptLines.length > 0 ? null : parsed.transcriptText || null,
    };
  } catch {
    return null;
  }
}

export function loadMeetingIndex(): MeetingIndex {
  return resolveMeetingIndex().index;
}

export function loadMeetingIndexWithOptions(options: MeetingLoaderOptions): MeetingIndex {
  return resolveMeetingIndex(options).index;
}

export function loadMeetingDetail(meetingId: string): MeetingDetail | null {
  return loadMeetingDetailWithOptions(meetingId, {});
}

export function loadMeetingDetailWithOptions(meetingId: string, options: MeetingLoaderOptions): MeetingDetail | null {
  const resolved = resolveMeetingIndex(options);
  const meeting = resolved.index.meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    return null;
  }
  return loadMeetingDetailFromRecording(meeting);
}

export function loadMeetingTranscript(meetingId: string): MeetingTranscript | null {
  return loadMeetingDetail(meetingId);
}
