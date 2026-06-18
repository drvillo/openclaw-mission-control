import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  backfillAssertionAssociations,
  ingestMeetingDocument,
  importLegacyMyntStateFile,
  recordMeetingIngestionFailure,
  type MeetingIngestionEvidenceLink,
  type MeetingIngestionPayload,
  type MeetingIngestionResult,
} from "@ocmc/db";
import { parseMeetingMarkdown, type MeetingReviewItem } from "@ocmc/shared";
import { FATHOM_RECORDINGS_ROOT, MISSION_CONTROL_STATE_DIR, OBSIDIAN_VAULT } from "./config";

type IngestionErrorKind = "invalid_path" | "not_found" | "read_failed" | "parse_failed" | "ingest_failed";

export type IngestMeetingNotePathOptions = {
  capturedAt?: string;
  ingestedAt?: string;
  vaultRoot?: string;
  allowedRoot?: string;
  syncMyntIdentities?: boolean;
};

export type MeetingNotePathIngestionResult = {
  status: "ingested" | "noop" | "failed";
  sourceDocumentId?: string;
  meetingId?: string;
  documentVersionId?: string;
  extractionRunId?: string;
  canonicalSourcePath?: string;
  absolutePath?: string;
  participantCount?: number;
  transcriptSegmentCount?: number;
  actionCount?: number;
  decisionCount?: number;
  ingestionRunId?: string;
  error?: string;
  errorKind?: IngestionErrorKind;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFingerprintPart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function buildAssertionFingerprint(kind: "action" | "decision", item: MeetingReviewItem) {
  return sha256(
    [
      kind,
      normalizeFingerprintPart(item.summary),
      normalizeFingerprintPart(kind === "action" ? item.assignee : item.owner),
      normalizeFingerprintPart(item.dueDate),
      normalizeFingerprintPart(item.dueText),
    ].join("\u0000"),
  );
}

function sortStrings(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function syncMyntIdentityState(db: DatabaseSync): void {
  importLegacyMyntStateFile(db, path.join(MISSION_CONTROL_STATE_DIR, "mynt-identities.json"));
}

export function canonicalizeMeetingSourcePath(filePath: string) {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(OBSIDIAN_VAULT, absolutePath);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }
  return absolutePath;
}

function canonicalizeMeetingSourcePathForVault(filePath: string, vaultRoot: string) {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(path.resolve(vaultRoot), absolutePath);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }
  return absolutePath;
}

function isPathInside(parent: string, child: string) {
  const relativePath = path.relative(path.resolve(parent), path.resolve(child));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveMeetingNotePath(sourcePath: string, options: IngestMeetingNotePathOptions = {}) {
  if (typeof sourcePath !== "string" || !sourcePath.trim()) {
    throw Object.assign(new Error("sourcePath is required"), { kind: "invalid_path" satisfies IngestionErrorKind });
  }
  if (sourcePath.includes("\0")) {
    throw Object.assign(new Error("sourcePath contains an invalid character"), { kind: "invalid_path" satisfies IngestionErrorKind });
  }

  const vaultRoot = path.resolve(options.vaultRoot ?? OBSIDIAN_VAULT);
  const allowedRoot = path.resolve(options.allowedRoot ?? FATHOM_RECORDINGS_ROOT);
  const absolutePath = path.isAbsolute(sourcePath) ? path.resolve(sourcePath) : path.resolve(vaultRoot, sourcePath);

  if (path.extname(absolutePath).toLowerCase() !== ".md") {
    throw Object.assign(new Error("sourcePath must point to a markdown .md file"), { kind: "invalid_path" satisfies IngestionErrorKind });
  }
  if (!isPathInside(vaultRoot, absolutePath)) {
    throw Object.assign(new Error("sourcePath must resolve inside the Obsidian vault"), { kind: "invalid_path" satisfies IngestionErrorKind });
  }
  if (!isPathInside(allowedRoot, absolutePath)) {
    throw Object.assign(new Error("sourcePath must resolve inside Meeting Recordings/Fathom"), {
      kind: "invalid_path" satisfies IngestionErrorKind,
    });
  }

  return {
    absolutePath,
    canonicalSourcePath: canonicalizeMeetingSourcePathForVault(absolutePath, vaultRoot),
    vaultRoot,
    allowedRoot,
  };
}

function obsidianRefForPath(canonicalSourcePath: string) {
  return canonicalSourcePath.replace(/\.md$/u, "");
}

function extractQuoteForTimestamp(evidence: string | null, timestamp: string) {
  if (!evidence) {
    return null;
  }
  const line = evidence
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.includes(`[${timestamp}]`));
  return line || null;
}

function buildEvidenceLinks(item: MeetingReviewItem): MeetingIngestionEvidenceLink[] {
  return item.evidenceTimestamps.map((timestamp) => ({
    timestamp,
    quoteText: extractQuoteForTimestamp(item.evidence, timestamp),
  }));
}

export function buildMeetingIngestionPayload(
  filePath: string,
  markdown: string,
  options?: { capturedAt?: string; ingestedAt?: string; vaultRoot?: string },
): MeetingIngestionPayload {
  const absolutePath = path.resolve(filePath);
  const stat = fs.statSync(absolutePath);
  const parsed = parseMeetingMarkdown(markdown);
  const canonicalSourcePath = options?.vaultRoot
    ? canonicalizeMeetingSourcePathForVault(absolutePath, options.vaultRoot)
    : canonicalizeMeetingSourcePath(absolutePath);
  const obsidianRef = obsidianRefForPath(canonicalSourcePath);
  const ingestedAt = options?.ingestedAt ?? new Date().toISOString();
  const capturedAt = options?.capturedAt ?? stat.mtime.toISOString();
  const stem = path.basename(absolutePath, ".md");
  const title = parsed.title ?? parsed.meetingTitle ?? stem;
  const meetingDay = parsed.meetingDay ?? parsed.dateTime?.slice(0, 10) ?? null;
  const meetingMonth = parsed.meetingMonth ?? meetingDay?.slice(0, 7) ?? null;
  const sourceType = parsed.source ?? "fathom";

  return {
    sourceType,
    canonicalSourcePath,
    obsidianRef,
    absolutePath,
    contentHash: sha256(markdown),
    rawMarkdown: markdown,
    pageSchemaVersion: parsed.pageSchemaVersion,
    capturedAt,
    ingestedAt,
    meeting: {
      recordingId: parsed.recordingId ?? stem,
      title,
      startedAt: parsed.dateTime,
      meetingDay,
      meetingMonth,
      playbackUrl: parsed.playbackUrl,
      shareUrl: parsed.shareUrl,
    },
    extractionRun: {
      providerRunId: parsed.provenance?.runId ?? null,
      flowId: parsed.provenance?.flowId ?? null,
      extractor: parsed.provenance?.extractor ?? null,
      model: parsed.provenance?.modelUsed ?? null,
      promptHash: parsed.provenance?.promptHash ?? null,
      transcriptSha256: parsed.provenance?.transcriptSha256 ?? sha256(parsed.transcriptText),
      processedAt: parsed.provenance?.processedAt ?? null,
      status: "completed",
      rawJson: JSON.stringify(
        {
          canonicalSourcePath,
          provenance: parsed.provenance,
          pageSchemaVersion: parsed.pageSchemaVersion,
        },
        null,
        2,
      ),
    },
    participants: parsed.participants.map((rawName, index) => ({
      rawName,
      participantKey: parsed.participantKeys[index] ?? null,
    })),
    transcriptSegments: parsed.transcriptLines.map((line, index) => ({
      sequence: index + 1,
      startTimestamp: line.time,
      endTimestamp: line.time,
      speakerRaw: line.speaker,
      text: line.text,
    })),
    actions: parsed.actions.map((item, index) => ({
      sequence: index + 1,
      externalAssertionId: item.id,
      label: item.label,
      status: item.status,
      taskId: item.taskId,
      detailsRef: item.detailsRef,
      rawAssignee: item.assignee,
      dueDate: item.dueDate,
      dueText: item.dueText,
      confidence: item.confidence,
      score: item.score,
      summary: item.summary,
      evidenceText: item.evidence,
      evidenceTargetTime: item.evidenceTargetTime,
      fingerprint: buildAssertionFingerprint("action", item),
      reviewStatus: "needs_review",
      rawJson: JSON.stringify(item, null, 2),
      evidenceLinks: buildEvidenceLinks(item),
    })),
    decisions: parsed.decisions.map((item, index) => ({
      sequence: index + 1,
      externalAssertionId: item.id,
      label: item.label,
      taskId: item.taskId,
      detailsRef: item.detailsRef,
      rawOwner: item.owner,
      confidence: item.confidence,
      score: item.score,
      summary: item.summary,
      evidenceText: item.evidence,
      evidenceTargetTime: item.evidenceTargetTime,
      fingerprint: buildAssertionFingerprint("decision", item),
      reviewStatus: "needs_review",
      rawJson: JSON.stringify(item, null, 2),
      evidenceLinks: buildEvidenceLinks(item),
    })),
  };
}

export function ingestMeetingNoteFile(
  db: DatabaseSync,
  filePath: string,
  options?: { capturedAt?: string; ingestedAt?: string; syncMyntIdentities?: boolean },
): MeetingIngestionResult {
  const absolutePath = path.resolve(filePath);
  const markdown = fs.readFileSync(absolutePath, "utf8");
  if (options?.syncMyntIdentities !== false) {
    syncMyntIdentityState(db);
  }
  return ingestMeetingDocument(db, buildMeetingIngestionPayload(absolutePath, markdown, options));
}

export function ingestMeetingNotePath(
  db: DatabaseSync,
  sourcePath: string,
  options: IngestMeetingNotePathOptions = {},
): MeetingNotePathIngestionResult {
  let resolved: ReturnType<typeof resolveMeetingNotePath>;
  const ingestedAt = options.ingestedAt ?? new Date().toISOString();
  try {
    resolved = resolveMeetingNotePath(sourcePath, options);
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      errorKind: "invalid_path",
    };
  }

  let markdown: string | null = null;
  try {
    if (!fs.existsSync(resolved.absolutePath)) {
      const message = `Meeting note not found: ${resolved.absolutePath}`;
      const ingestionRunId = recordMeetingIngestionFailure(db, {
        canonicalSourcePath: resolved.canonicalSourcePath,
        message,
        startedAt: ingestedAt,
        finishedAt: new Date().toISOString(),
      });
      return {
        status: "failed",
        canonicalSourcePath: resolved.canonicalSourcePath,
        absolutePath: resolved.absolutePath,
        ingestionRunId,
        error: message,
        errorKind: "not_found",
      };
    }

    const realPath = fs.realpathSync(resolved.absolutePath);
    const realVaultRoot = fs.realpathSync(resolved.vaultRoot);
    const realAllowedRoot = fs.realpathSync(resolved.allowedRoot);
    if (!isPathInside(realVaultRoot, realPath) || !isPathInside(realAllowedRoot, realPath)) {
      return {
        status: "failed",
        canonicalSourcePath: resolved.canonicalSourcePath,
        absolutePath: resolved.absolutePath,
        error: "sourcePath must not resolve outside the Obsidian vault",
        errorKind: "invalid_path",
      };
    }

    markdown = fs.readFileSync(realPath, "utf8");
    const payload = buildMeetingIngestionPayload(realPath, markdown, {
      capturedAt: options.capturedAt,
      ingestedAt,
      vaultRoot: realVaultRoot,
    });
    if (options.syncMyntIdentities !== false) {
      syncMyntIdentityState(db);
    }
    const result = ingestMeetingDocument(db, payload);
    return {
      ...result,
      canonicalSourcePath: payload.canonicalSourcePath,
      absolutePath: payload.absolutePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ingestionRunId = recordMeetingIngestionFailure(db, {
      canonicalSourcePath: resolved.canonicalSourcePath,
      contentHash: markdown ? sha256(markdown) : undefined,
      message,
      startedAt: ingestedAt,
      finishedAt: new Date().toISOString(),
    });
    const errorKind: IngestionErrorKind = markdown === null ? "read_failed" : "parse_failed";
    return {
      status: "failed",
      canonicalSourcePath: resolved.canonicalSourcePath,
      absolutePath: resolved.absolutePath,
      ingestionRunId,
      error: message,
      errorKind,
    };
  }
}

export function listMeetingNoteFiles(rootDir = FATHOM_RECORDINGS_ROOT): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "Index.md")
    .map((entry) => path.join(rootDir, entry.name))
    .sort((left, right) => right.localeCompare(left));
}

type MeetingBackfillExpectation = {
  canonicalSourcePath: string;
  participantNames: string[];
  actionFingerprints: string[];
  decisionFingerprints: string[];
  actionCount: number;
  decisionCount: number;
};

export type MeetingBackfillFileResult = {
  filePath: string;
  canonicalSourcePath: string;
  status: "ingested" | "noop" | "failed";
  meetingId?: string;
  documentVersionId?: string;
  extractionRunId?: string;
  participantCount?: number;
  actionCount?: number;
  decisionCount?: number;
  error?: string;
};

export type MeetingBackfillMismatch = {
  canonicalSourcePath: string;
  reason:
    | "missing_source_document"
    | "missing_meeting"
    | "participant_mismatch"
    | "action_mismatch"
    | "decision_mismatch";
  markdownParticipantCount: number;
  dbParticipantCount: number;
  markdownActionCount: number;
  dbActionCount: number;
  markdownDecisionCount: number;
  dbDecisionCount: number;
  missingActionFingerprints: string[];
  extraActionFingerprints: string[];
  missingDecisionFingerprints: string[];
  extraDecisionFingerprints: string[];
  missingParticipants: string[];
  extraParticipants: string[];
};

export type MeetingBackfillReconciliation = {
  markdown: {
    meetings: number;
    participants: number;
    actions: number;
    decisions: number;
  };
  db: {
    sourceDocuments: number;
    meetings: number;
    participants: number;
    actions: number;
    decisions: number;
    failedRuns: number;
  };
  mismatches: MeetingBackfillMismatch[];
};

export type MeetingBackfillSummary = {
  rootDir: string;
  startedAt: string;
  finishedAt: string;
  totals: {
    discovered: number;
    processed: number;
    ingested: number;
    noop: number;
    failed: number;
  };
  files: MeetingBackfillFileResult[];
  reconciliation: MeetingBackfillReconciliation;
};

export type BackfillMeetingNotesOptions = {
  rootDir?: string;
  filePaths?: string[];
  startedAt?: string;
  vaultRoot?: string;
};

export type BackfillAssertionAssociationsSummary = {
  startedAt: string;
  finishedAt: string;
  identitiesSynced: number;
  aliasesInserted: number;
  scannedAssertions: number;
  inserted: number;
  deleted: number;
};

function buildExpectation(payload: MeetingIngestionPayload): MeetingBackfillExpectation {
  return {
    canonicalSourcePath: payload.canonicalSourcePath,
    participantNames: sortStrings(payload.participants.map((participant) => participant.rawName)),
    actionFingerprints: sortStrings(payload.actions.map((action) => action.fingerprint)),
    decisionFingerprints: sortStrings(payload.decisions.map((decision) => decision.fingerprint)),
    actionCount: payload.actions.length,
    decisionCount: payload.decisions.length,
  };
}

function inferVaultRootForMeetingBackfill(rootDir: string) {
  const resolvedRoot = path.resolve(rootDir);
  if (path.basename(resolvedRoot) === "Fathom" && path.basename(path.dirname(resolvedRoot)) === "Meeting Recordings") {
    return path.dirname(path.dirname(resolvedRoot));
  }
  return OBSIDIAN_VAULT;
}

function arrayDifference(left: string[], right: string[]) {
  const rightCounts = new Map<string, number>();
  for (const value of right) {
    rightCounts.set(value, (rightCounts.get(value) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const value of left) {
    const count = rightCounts.get(value) ?? 0;
    if (count <= 0) {
      missing.push(value);
      continue;
    }
    rightCounts.set(value, count - 1);
  }
  return sortStrings(missing);
}

function buildInClause(values: string[]) {
  return values.map(() => "?").join(", ");
}

function reconcileMeetingsBackfill(
  db: DatabaseSync,
  expectations: Map<string, MeetingBackfillExpectation>,
  canonicalSourcePaths: string[],
): MeetingBackfillReconciliation {
  if (canonicalSourcePaths.length === 0) {
    return {
      markdown: { meetings: 0, participants: 0, actions: 0, decisions: 0 },
      db: { sourceDocuments: 0, meetings: 0, participants: 0, actions: 0, decisions: 0, failedRuns: 0 },
      mismatches: [],
    };
  }

  const inClause = buildInClause(canonicalSourcePaths);
  const sourceRows = db
    .prepare(
      `SELECT
         sd.canonical_source_path as canonicalSourcePath,
         sd.source_document_id as sourceDocumentId,
         m.meeting_id as meetingId,
         COALESCE(m.participant_count, 0) as participantCount,
         COALESCE(m.action_count, 0) as actionCount,
         COALESCE(m.decision_count, 0) as decisionCount
       FROM source_documents sd
       LEFT JOIN meetings m ON m.source_document_id = sd.source_document_id
       WHERE sd.canonical_source_path IN (${inClause});`,
    )
    .all(...canonicalSourcePaths) as Array<{
    canonicalSourcePath?: string;
    sourceDocumentId?: string;
    meetingId?: string;
    participantCount?: number;
    actionCount?: number;
    decisionCount?: number;
  }>;

  const participantRows = db
    .prepare(
      `SELECT sd.canonical_source_path as canonicalSourcePath, mp.raw_name as rawName
       FROM source_documents sd
       JOIN meetings m ON m.source_document_id = sd.source_document_id
       JOIN meeting_participants mp
         ON mp.meeting_id = m.meeting_id
        AND mp.document_version_id = m.current_document_version_id
       WHERE sd.canonical_source_path IN (${inClause})
       ORDER BY sd.canonical_source_path, mp.sequence;`,
    )
    .all(...canonicalSourcePaths) as Array<{ canonicalSourcePath?: string; rawName?: string }>;

  const actionRows = db
    .prepare(
      `SELECT sd.canonical_source_path as canonicalSourcePath, aa.fingerprint as fingerprint
       FROM source_documents sd
       JOIN meetings m ON m.source_document_id = sd.source_document_id
       JOIN action_assertions aa
         ON aa.meeting_id = m.meeting_id
        AND aa.document_version_id = m.current_document_version_id
       WHERE sd.canonical_source_path IN (${inClause})
       ORDER BY sd.canonical_source_path, aa.sequence;`,
    )
    .all(...canonicalSourcePaths) as Array<{ canonicalSourcePath?: string; fingerprint?: string }>;

  const decisionRows = db
    .prepare(
      `SELECT sd.canonical_source_path as canonicalSourcePath, da.fingerprint as fingerprint
       FROM source_documents sd
       JOIN meetings m ON m.source_document_id = sd.source_document_id
       JOIN decision_assertions da
         ON da.meeting_id = m.meeting_id
        AND da.document_version_id = m.current_document_version_id
       WHERE sd.canonical_source_path IN (${inClause})
       ORDER BY sd.canonical_source_path, da.sequence;`,
    )
    .all(...canonicalSourcePaths) as Array<{ canonicalSourcePath?: string; fingerprint?: string }>;

  const failedRunsRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM meeting_ingestion_runs
       WHERE canonical_source_path IN (${inClause})
         AND status = 'failed';`,
    )
    .get(...canonicalSourcePaths) as { count?: number } | undefined;

  const sourceRowByPath = new Map<string, (typeof sourceRows)[number]>();
  for (const row of sourceRows) {
    if (row.canonicalSourcePath) {
      sourceRowByPath.set(row.canonicalSourcePath, row);
    }
  }

  const participantsByPath = new Map<string, string[]>();
  for (const row of participantRows) {
    const canonicalSourcePath = row.canonicalSourcePath;
    if (!canonicalSourcePath || !row.rawName) {
      continue;
    }
    participantsByPath.set(canonicalSourcePath, [...(participantsByPath.get(canonicalSourcePath) ?? []), row.rawName]);
  }

  const actionsByPath = new Map<string, string[]>();
  for (const row of actionRows) {
    const canonicalSourcePath = row.canonicalSourcePath;
    if (!canonicalSourcePath || !row.fingerprint) {
      continue;
    }
    actionsByPath.set(canonicalSourcePath, [...(actionsByPath.get(canonicalSourcePath) ?? []), row.fingerprint]);
  }

  const decisionsByPath = new Map<string, string[]>();
  for (const row of decisionRows) {
    const canonicalSourcePath = row.canonicalSourcePath;
    if (!canonicalSourcePath || !row.fingerprint) {
      continue;
    }
    decisionsByPath.set(canonicalSourcePath, [...(decisionsByPath.get(canonicalSourcePath) ?? []), row.fingerprint]);
  }

  const mismatches: MeetingBackfillMismatch[] = [];

  for (const [canonicalSourcePath, expected] of expectations.entries()) {
    const sourceRow = sourceRowByPath.get(canonicalSourcePath);
    if (!sourceRow) {
      mismatches.push({
        canonicalSourcePath,
        reason: "missing_source_document",
        markdownParticipantCount: expected.participantNames.length,
        dbParticipantCount: 0,
        markdownActionCount: expected.actionCount,
        dbActionCount: 0,
        markdownDecisionCount: expected.decisionCount,
        dbDecisionCount: 0,
        missingActionFingerprints: expected.actionFingerprints,
        extraActionFingerprints: [],
        missingDecisionFingerprints: expected.decisionFingerprints,
        extraDecisionFingerprints: [],
        missingParticipants: expected.participantNames,
        extraParticipants: [],
      });
      continue;
    }

    if (!sourceRow.meetingId) {
      mismatches.push({
        canonicalSourcePath,
        reason: "missing_meeting",
        markdownParticipantCount: expected.participantNames.length,
        dbParticipantCount: 0,
        markdownActionCount: expected.actionCount,
        dbActionCount: 0,
        markdownDecisionCount: expected.decisionCount,
        dbDecisionCount: 0,
        missingActionFingerprints: expected.actionFingerprints,
        extraActionFingerprints: [],
        missingDecisionFingerprints: expected.decisionFingerprints,
        extraDecisionFingerprints: [],
        missingParticipants: expected.participantNames,
        extraParticipants: [],
      });
      continue;
    }

    const dbParticipants = sortStrings(participantsByPath.get(canonicalSourcePath) ?? []);
    const dbActions = sortStrings(actionsByPath.get(canonicalSourcePath) ?? []);
    const dbDecisions = sortStrings(decisionsByPath.get(canonicalSourcePath) ?? []);
    const participantMismatch =
      expected.participantNames.length !== dbParticipants.length ||
      arrayDifference(expected.participantNames, dbParticipants).length > 0 ||
      arrayDifference(dbParticipants, expected.participantNames).length > 0;
    const actionMismatch =
      expected.actionFingerprints.length !== dbActions.length ||
      arrayDifference(expected.actionFingerprints, dbActions).length > 0 ||
      arrayDifference(dbActions, expected.actionFingerprints).length > 0;
    const decisionMismatch =
      expected.decisionFingerprints.length !== dbDecisions.length ||
      arrayDifference(expected.decisionFingerprints, dbDecisions).length > 0 ||
      arrayDifference(dbDecisions, expected.decisionFingerprints).length > 0;

    if (!participantMismatch && !actionMismatch && !decisionMismatch) {
      continue;
    }

    mismatches.push({
      canonicalSourcePath,
      reason: participantMismatch ? "participant_mismatch" : actionMismatch ? "action_mismatch" : "decision_mismatch",
      markdownParticipantCount: expected.participantNames.length,
      dbParticipantCount: Number(sourceRow.participantCount ?? dbParticipants.length),
      markdownActionCount: expected.actionCount,
      dbActionCount: Number(sourceRow.actionCount ?? dbActions.length),
      markdownDecisionCount: expected.decisionCount,
      dbDecisionCount: Number(sourceRow.decisionCount ?? dbDecisions.length),
      missingActionFingerprints: arrayDifference(expected.actionFingerprints, dbActions),
      extraActionFingerprints: arrayDifference(dbActions, expected.actionFingerprints),
      missingDecisionFingerprints: arrayDifference(expected.decisionFingerprints, dbDecisions),
      extraDecisionFingerprints: arrayDifference(dbDecisions, expected.decisionFingerprints),
      missingParticipants: arrayDifference(expected.participantNames, dbParticipants),
      extraParticipants: arrayDifference(dbParticipants, expected.participantNames),
    });
  }

  const markdownMeetings = [...expectations.values()];

  return {
    markdown: {
      meetings: markdownMeetings.length,
      participants: markdownMeetings.reduce((sum, meeting) => sum + meeting.participantNames.length, 0),
      actions: markdownMeetings.reduce((sum, meeting) => sum + meeting.actionCount, 0),
      decisions: markdownMeetings.reduce((sum, meeting) => sum + meeting.decisionCount, 0),
    },
    db: {
      sourceDocuments: sourceRows.length,
      meetings: sourceRows.filter((row) => row.meetingId).length,
      participants: sourceRows.reduce((sum, row) => sum + Number(row.participantCount ?? 0), 0),
      actions: sourceRows.reduce((sum, row) => sum + Number(row.actionCount ?? 0), 0),
      decisions: sourceRows.reduce((sum, row) => sum + Number(row.decisionCount ?? 0), 0),
      failedRuns: Number(failedRunsRow?.count ?? 0),
    },
    mismatches,
  };
}

export function backfillMeetingNotes(db: DatabaseSync, options: BackfillMeetingNotesOptions = {}): MeetingBackfillSummary {
  const rootDir = path.resolve(options.rootDir ?? FATHOM_RECORDINGS_ROOT);
  const filePaths = (options.filePaths ?? listMeetingNoteFiles(rootDir)).map((filePath) => path.resolve(filePath));
  const vaultRoot = path.resolve(options.vaultRoot ?? inferVaultRootForMeetingBackfill(rootDir));
  const startedAt = options.startedAt ?? new Date().toISOString();
  const expectations = new Map<string, MeetingBackfillExpectation>();
  const files: MeetingBackfillFileResult[] = [];

  for (const filePath of filePaths) {
    const ingestedAt = new Date().toISOString();
    const result = ingestMeetingNotePath(db, filePath, {
      allowedRoot: rootDir,
      vaultRoot,
      ingestedAt,
    });

    if (result.status === "failed") {
      files.push({
        filePath,
        canonicalSourcePath: result.canonicalSourcePath ?? canonicalizeMeetingSourcePathForVault(filePath, vaultRoot),
        status: "failed",
        error: result.error,
      });
      continue;
    }

    try {
      const markdown = fs.readFileSync(filePath, "utf8");
      const payload = buildMeetingIngestionPayload(filePath, markdown, { ingestedAt, vaultRoot });
      expectations.set(payload.canonicalSourcePath, buildExpectation(payload));
      files.push({
        filePath,
        canonicalSourcePath: payload.canonicalSourcePath,
        status: result.status,
        meetingId: result.meetingId,
        documentVersionId: result.documentVersionId,
        extractionRunId: result.extractionRunId,
        participantCount: result.participantCount,
        actionCount: result.actionCount,
        decisionCount: result.decisionCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      files.push({
        filePath,
        canonicalSourcePath: result.canonicalSourcePath ?? canonicalizeMeetingSourcePathForVault(filePath, vaultRoot),
        status: "failed",
        error: message,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const reconciliation = reconcileMeetingsBackfill(
    db,
    expectations,
    [...new Set(files.map((file) => file.canonicalSourcePath))].sort((left, right) => left.localeCompare(right)),
  );

  return {
    rootDir,
    startedAt,
    finishedAt,
    totals: {
      discovered: filePaths.length,
      processed: files.length,
      ingested: files.filter((file) => file.status === "ingested").length,
      noop: files.filter((file) => file.status === "noop").length,
      failed: files.filter((file) => file.status === "failed").length,
    },
    files,
    reconciliation,
  };
}

export function backfillMeetingAssertionAssociations(db: DatabaseSync): BackfillAssertionAssociationsSummary {
  const startedAt = new Date().toISOString();
  const identitySync = importLegacyMyntStateFile(db, path.join(MISSION_CONTROL_STATE_DIR, "mynt-identities.json"), startedAt);
  const associationSync = backfillAssertionAssociations(db, startedAt);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    identitiesSynced: identitySync.identities,
    aliasesInserted: identitySync.aliases,
    scannedAssertions: associationSync.scannedAssertions,
    inserted: associationSync.inserted,
    deleted: associationSync.deleted,
  };
}
