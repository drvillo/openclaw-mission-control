import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AuditFinding,
  CronJob,
  CronRun,
  EventEnvelope,
  MemoryHealth,
  RoutingAttempt,
  RuntimeTask,
  TaskFlow,
  TaskSnapshot,
} from "@ocmc/shared";

export type DerivedStatePayload = {
  webhookEvents: EventEnvelope[];
  taskSnapshots: TaskSnapshot[];
  runtimeTasks: RuntimeTask[];
  taskFlows: TaskFlow[];
  auditFindings: AuditFinding[];
  memoryHealth?: MemoryHealth[];
  cronJobs?: CronJob[];
  cronRuns?: CronRun[];
  routingAttempts?: RoutingAttempt[];
};

export type MeetingIngestionEvidenceLink = {
  timestamp: string;
  quoteText?: string | null;
};

export type MeetingIngestionParticipant = {
  rawName: string;
  participantKey?: string | null;
  identityId?: string | null;
};

export type MeetingIngestionTranscriptSegment = {
  sequence: number;
  startTimestamp: string;
  endTimestamp?: string | null;
  speakerRaw: string;
  speakerIdentityId?: string | null;
  text: string;
};

export type MeetingIngestionActionAssertion = {
  sequence: number;
  externalAssertionId?: string | null;
  label: string;
  status?: string | null;
  taskId?: string | null;
  detailsRef?: string | null;
  rawAssignee?: string | null;
  dueDate?: string | null;
  dueText?: string | null;
  confidence?: string | null;
  score?: number | null;
  summary: string;
  evidenceText?: string | null;
  evidenceTargetTime?: string | null;
  fingerprint: string;
  reviewStatus?: string;
  rawJson: string;
  evidenceLinks?: MeetingIngestionEvidenceLink[];
};

export type MeetingIngestionDecisionAssertion = {
  sequence: number;
  externalAssertionId?: string | null;
  label: string;
  taskId?: string | null;
  detailsRef?: string | null;
  rawOwner?: string | null;
  confidence?: string | null;
  score?: number | null;
  summary: string;
  evidenceText?: string | null;
  evidenceTargetTime?: string | null;
  fingerprint: string;
  reviewStatus?: string;
  rawJson: string;
  evidenceLinks?: MeetingIngestionEvidenceLink[];
};

export type MeetingIngestionPayload = {
  sourceDocumentId?: string;
  sourceType: string;
  canonicalSourcePath: string;
  obsidianRef: string;
  absolutePath: string;
  contentHash: string;
  rawMarkdown: string;
  pageSchemaVersion?: string | null;
  capturedAt: string;
  ingestedAt: string;
  meeting: {
    meetingId?: string;
    recordingId?: string | null;
    title: string;
    startedAt?: string | null;
    meetingDay?: string | null;
    meetingMonth?: string | null;
    playbackUrl?: string | null;
    shareUrl?: string | null;
  };
  extractionRun: {
    providerRunId?: string | null;
    flowId?: string | null;
    extractor?: string | null;
    model?: string | null;
    promptHash?: string | null;
    transcriptSha256?: string | null;
    processedAt?: string | null;
    status?: string;
    errorMessage?: string | null;
    rawJson: string;
  };
  participants: MeetingIngestionParticipant[];
  transcriptSegments: MeetingIngestionTranscriptSegment[];
  actions: MeetingIngestionActionAssertion[];
  decisions: MeetingIngestionDecisionAssertion[];
};

export type MeetingIngestionResult = {
  status: "ingested" | "noop";
  sourceDocumentId: string;
  meetingId: string;
  documentVersionId: string;
  extractionRunId: string;
  participantCount: number;
  transcriptSegmentCount: number;
  actionCount: number;
  decisionCount: number;
};

export type MeetingAssertionReviewItem = {
  kind: "action" | "decision";
  assertionId: string;
};

export type MeetingAssertionReviewResult = {
  accepted: number;
  rejected: number;
};

export type ActionAssertionReassignmentResult = {
  reassigned: number;
};

export const ACTION_WORKFLOW_STATUSES = ["todo", "next", "in_progress", "done"] as const;

export type ActionWorkflowStatus = (typeof ACTION_WORKFLOW_STATUSES)[number];

export type ActionAssertionStatusUpdateResult = {
  updated: number;
  status: ActionWorkflowStatus;
};

export type MeetingIngestionFailurePayload = {
  sourceDocumentId?: string | null;
  canonicalSourcePath: string;
  contentHash?: string | null;
  message: string;
  startedAt: string;
  finishedAt?: string | null;
  documentVersionId?: string | null;
  extractionRunId?: string | null;
};

function stableId(prefix: string, ...parts: Array<string | null | undefined>) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\u0000");
  }
  return `${prefix}_${hash.digest("hex")}`;
}

function repairMissingMeetingAssertionsForVersion(
  db: DatabaseSync,
  input: MeetingIngestionPayload,
  ids: {
    meetingId: string;
    documentVersionId: string;
    extractionRunId: string;
  },
): { insertedActions: number; insertedDecisions: number; updatedMeetingCounts: boolean } {
  const existingActionCount = (
    db
      .prepare(`SELECT COUNT(*) as count FROM action_assertions WHERE document_version_id = ?;`)
      .get(ids.documentVersionId) as { count?: number } | undefined
  )?.count ?? 0;
  const existingDecisionCount = (
    db
      .prepare(`SELECT COUNT(*) as count FROM decision_assertions WHERE document_version_id = ?;`)
      .get(ids.documentVersionId) as { count?: number } | undefined
  )?.count ?? 0;
  const meetingCounts = db
    .prepare(
      `SELECT action_count as actionCount, decision_count as decisionCount
       FROM meetings
       WHERE meeting_id = ?
       LIMIT 1;`,
    )
    .get(ids.meetingId) as { actionCount?: number; decisionCount?: number } | undefined;
  const needsActionRepair = existingActionCount < input.actions.length;
  const needsDecisionRepair = existingDecisionCount < input.decisions.length;
  const needsMeetingCountRepair = meetingCounts?.actionCount !== input.actions.length || meetingCounts?.decisionCount !== input.decisions.length;

  if (!needsActionRepair && !needsDecisionRepair && !needsMeetingCountRepair) {
    return { insertedActions: 0, insertedDecisions: 0, updatedMeetingCounts: false };
  }

  const transcriptSegmentIdsByTimestamp = new Map<string, string[]>();
  const segmentRows = db
    .prepare(
      `SELECT transcript_segment_id as transcriptSegmentId, start_timestamp as startTimestamp
       FROM transcript_segments
       WHERE meeting_id = ? AND document_version_id = ?
       ORDER BY sequence ASC;`,
    )
    .all(ids.meetingId, ids.documentVersionId) as Array<{ transcriptSegmentId?: string; startTimestamp?: string }>;
  for (const row of segmentRows) {
    if (!row.startTimestamp || !row.transcriptSegmentId) {
      continue;
    }
    transcriptSegmentIdsByTimestamp.set(row.startTimestamp, [
      ...(transcriptSegmentIdsByTimestamp.get(row.startTimestamp) ?? []),
      row.transcriptSegmentId,
    ]);
  }

  const insertActionAssertion = db.prepare(`
    INSERT INTO action_assertions (
      action_assertion_id, extraction_run_id, meeting_id, document_version_id,
      external_assertion_id, label, status, task_id, details_ref, raw_assignee, due_date, due_text,
      confidence, score, summary, evidence_text, evidence_target_time,
      fingerprint, sequence, review_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertDecisionAssertion = db.prepare(`
    INSERT INTO decision_assertions (
      decision_assertion_id, extraction_run_id, meeting_id, document_version_id,
      external_assertion_id, label, task_id, details_ref, raw_owner, confidence, score, summary,
      evidence_text, evidence_target_time, fingerprint, sequence, review_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertEvidenceLink = db.prepare(`
    INSERT INTO evidence_links (
      evidence_link_id, assertion_kind, assertion_id, transcript_segment_id,
      timestamp, quote_text, sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?);
  `);
  const existingAction = db.prepare(`
    SELECT 1
    FROM action_assertions
    WHERE document_version_id = ?
      AND (
        action_assertion_id = ?
        OR (external_assertion_id IS NOT NULL AND external_assertion_id = ?)
      )
    LIMIT 1;
  `);
  const existingDecision = db.prepare(`
    SELECT 1
    FROM decision_assertions
    WHERE document_version_id = ?
      AND (
        decision_assertion_id = ?
        OR (external_assertion_id IS NOT NULL AND external_assertion_id = ?)
      )
    LIMIT 1;
  `);

  let insertedActions = 0;
  for (const action of input.actions) {
    const actionAssertionId = stableId("action_assertion", ids.extractionRunId, String(action.sequence), action.fingerprint);
    const exists = existingAction.get(ids.documentVersionId, actionAssertionId, action.externalAssertionId ?? null);
    if (exists) {
      continue;
    }
    insertActionAssertion.run(
      actionAssertionId,
      ids.extractionRunId,
      ids.meetingId,
      ids.documentVersionId,
      action.externalAssertionId ?? null,
      action.label,
      action.status ?? null,
      action.taskId ?? null,
      action.detailsRef ?? null,
      action.rawAssignee ?? null,
      action.dueDate ?? null,
      action.dueText ?? null,
      action.confidence ?? null,
      action.score ?? null,
      action.summary,
      action.evidenceText ?? null,
      action.evidenceTargetTime ?? null,
      action.fingerprint,
      action.sequence,
      action.reviewStatus ?? "needs_review",
      action.rawJson,
    );
    insertedActions += 1;
    for (const [evidenceIndex, evidence] of (action.evidenceLinks ?? []).entries()) {
      insertEvidenceLink.run(
        stableId("evidence_link", actionAssertionId, String(evidenceIndex + 1), evidence.timestamp),
        "action",
        actionAssertionId,
        transcriptSegmentIdsByTimestamp.get(evidence.timestamp)?.[0] ?? null,
        evidence.timestamp,
        evidence.quoteText ?? null,
        evidenceIndex + 1,
      );
    }
  }

  let insertedDecisions = 0;
  for (const decision of input.decisions) {
    const decisionAssertionId = stableId("decision_assertion", ids.extractionRunId, String(decision.sequence), decision.fingerprint);
    const exists = existingDecision.get(ids.documentVersionId, decisionAssertionId, decision.externalAssertionId ?? null);
    if (exists) {
      continue;
    }
    insertDecisionAssertion.run(
      decisionAssertionId,
      ids.extractionRunId,
      ids.meetingId,
      ids.documentVersionId,
      decision.externalAssertionId ?? null,
      decision.label,
      decision.taskId ?? null,
      decision.detailsRef ?? null,
      decision.rawOwner ?? null,
      decision.confidence ?? null,
      decision.score ?? null,
      decision.summary,
      decision.evidenceText ?? null,
      decision.evidenceTargetTime ?? null,
      decision.fingerprint,
      decision.sequence,
      decision.reviewStatus ?? "needs_review",
      decision.rawJson,
    );
    insertedDecisions += 1;
    for (const [evidenceIndex, evidence] of (decision.evidenceLinks ?? []).entries()) {
      insertEvidenceLink.run(
        stableId("evidence_link", decisionAssertionId, String(evidenceIndex + 1), evidence.timestamp),
        "decision",
        decisionAssertionId,
        transcriptSegmentIdsByTimestamp.get(evidence.timestamp)?.[0] ?? null,
        evidence.timestamp,
        evidence.quoteText ?? null,
        evidenceIndex + 1,
      );
    }
  }

  if (needsMeetingCountRepair) {
    db.prepare(
      `UPDATE meetings
       SET action_count = ?, decision_count = ?, updated_at = ?
       WHERE meeting_id = ?;`,
    ).run(input.actions.length, input.decisions.length, input.ingestedAt, ids.meetingId);
  }

  return { insertedActions, insertedDecisions, updatedMeetingCounts: needsMeetingCountRepair };
}

function replaceTable(db: DatabaseSync, table: string) {
  db.exec(`DELETE FROM ${table};`);
}

export function openMissionControlDb(filePath: string): DatabaseSync {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      route_id TEXT,
      flow_id TEXT,
      owner_agent TEXT,
      status TEXT NOT NULL,
      payload_path TEXT,
      correlation_id TEXT,
      last_error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_snapshots (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      board TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      assignee_type TEXT NOT NULL,
      assignee TEXT,
      agent_status TEXT NOT NULL,
      created_on TEXT NOT NULL,
      remind_on TEXT NOT NULL,
      run_id TEXT NOT NULL,
      flow_id TEXT,
      details_ref TEXT NOT NULL,
      results_ref TEXT NOT NULL,
      log_ref TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_tasks (
      task_id TEXT PRIMARY KEY,
      runtime TEXT,
      status TEXT NOT NULL,
      agent_id TEXT,
      label TEXT,
      owner_key TEXT,
      source_id TEXT,
      run_id TEXT,
      delivery_status TEXT,
      terminal_summary TEXT,
      terminal_outcome TEXT,
      created_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      last_event_at INTEGER,
      cleanup_after INTEGER,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_flows (
      flow_id TEXT PRIMARY KEY,
      sync_mode TEXT,
      controller_id TEXT,
      owner_key TEXT,
      goal TEXT,
      status TEXT NOT NULL,
      current_step TEXT,
      blocked_task_id TEXT,
      blocked_summary TEXT,
      created_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      last_event_at INTEGER,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_findings (
      finding_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT,
      token TEXT,
      detail TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_health (
      workspace_id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL,
      has_agents_md INTEGER NOT NULL DEFAULT 0,
      has_memory_md INTEGER NOT NULL DEFAULT 0,
      memory_dir_present INTEGER NOT NULL DEFAULT 0,
      has_today_daily INTEGER NOT NULL DEFAULT 0,
      latest_daily TEXT,
      qmd_healthy INTEGER NOT NULL DEFAULT 0,
      qmd_message TEXT NOT NULL,
      status TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_jobs (
      job_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      schedule_kind TEXT NOT NULL,
      schedule_label TEXT NOT NULL,
      session_target TEXT,
      wake_mode TEXT,
      last_run_status TEXT,
      last_run_at_ms INTEGER,
      next_run_at_ms INTEGER,
      last_duration_ms INTEGER,
      delivery_mode TEXT,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_runs (
      run_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      delivered INTEGER,
      delivery_status TEXT,
      session_id TEXT,
      session_key TEXT,
      run_at_ms INTEGER,
      duration_ms INTEGER,
      next_run_at_ms INTEGER,
      model TEXT,
      provider TEXT,
      recorded_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routing_attempts (
      routing_id TEXT PRIMARY KEY,
      recorded_at TEXT NOT NULL,
      source_agent TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      request_group_key TEXT NOT NULL,
      request_excerpt TEXT NOT NULL,
      policy_rule_id TEXT,
      policy_domain TEXT,
      expected_target_agent TEXT,
      actual_target_agent TEXT,
      mechanism TEXT NOT NULL,
      tool_call_id TEXT,
      accepted INTEGER,
      child_session_key TEXT,
      child_session_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL,
      completion_summary TEXT,
      failure_mode TEXT NOT NULL,
      recovery_mode TEXT NOT NULL,
      compliance_status TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_documents (
      source_document_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      canonical_source_path TEXT NOT NULL UNIQUE,
      obsidian_ref TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      external_source_id TEXT,
      playback_url TEXT,
      share_url TEXT,
      current_version_id TEXT,
      last_ingested_at TEXT,
      last_ingestion_status TEXT NOT NULL,
      last_ingestion_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      document_version_id TEXT PRIMARY KEY,
      source_document_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      raw_markdown TEXT NOT NULL,
      page_schema_version TEXT,
      captured_at TEXT NOT NULL,
      processed_at TEXT,
      extraction_run_id TEXT,
      UNIQUE(source_document_id, content_hash)
    );

    CREATE TABLE IF NOT EXISTS extraction_runs (
      extraction_run_id TEXT PRIMARY KEY,
      source_document_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      provider_run_id TEXT,
      flow_id TEXT,
      extractor TEXT,
      model TEXT,
      prompt_hash TEXT,
      transcript_sha256 TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      processed_at TEXT,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      meeting_id TEXT PRIMARY KEY,
      source_document_id TEXT NOT NULL UNIQUE,
      current_document_version_id TEXT NOT NULL,
      recording_id TEXT,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      started_at TEXT,
      meeting_day TEXT,
      meeting_month TEXT,
      playback_url TEXT,
      share_url TEXT,
      transcript_source_path TEXT NOT NULL,
      transcript_obsidian_ref TEXT NOT NULL,
      participant_count INTEGER NOT NULL DEFAULT 0,
      action_count INTEGER NOT NULL DEFAULT 0,
      decision_count INTEGER NOT NULL DEFAULT 0,
      last_ingested_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meeting_participants (
      meeting_participant_id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      raw_name TEXT NOT NULL,
      participant_key TEXT,
      identity_id TEXT
    );

    CREATE TABLE IF NOT EXISTS identities (
      identity_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      primary_email TEXT,
      is_self INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity_aliases (
      identity_alias_id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      alias_type TEXT NOT NULL,
      alias_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(identity_id, alias_type, alias_value)
    );

    CREATE TABLE IF NOT EXISTS transcript_segments (
      transcript_segment_id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      start_timestamp TEXT NOT NULL,
      end_timestamp TEXT,
      speaker_raw TEXT NOT NULL,
      speaker_identity_id TEXT,
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_assertions (
      action_assertion_id TEXT PRIMARY KEY,
      extraction_run_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      external_assertion_id TEXT,
      label TEXT NOT NULL,
      status TEXT,
      task_id TEXT,
      details_ref TEXT,
      raw_assignee TEXT,
      due_date TEXT,
      due_text TEXT,
      confidence TEXT,
      score INTEGER,
      summary TEXT NOT NULL,
      evidence_text TEXT,
      evidence_target_time TEXT,
      fingerprint TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      review_status TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      UNIQUE(extraction_run_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS decision_assertions (
      decision_assertion_id TEXT PRIMARY KEY,
      extraction_run_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      external_assertion_id TEXT,
      label TEXT NOT NULL,
      task_id TEXT,
      details_ref TEXT,
      raw_owner TEXT,
      confidence TEXT,
      score INTEGER,
      summary TEXT NOT NULL,
      evidence_text TEXT,
      evidence_target_time TEXT,
      fingerprint TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      review_status TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      UNIQUE(extraction_run_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS evidence_links (
      evidence_link_id TEXT PRIMARY KEY,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      transcript_segment_id TEXT,
      timestamp TEXT NOT NULL,
      quote_text TEXT,
      sequence INTEGER NOT NULL,
      UNIQUE(assertion_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS review_events (
      review_event_id TEXT PRIMARY KEY,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      target_object_id TEXT,
      reviewer TEXT,
      reviewed_at TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS meeting_ingestion_runs (
      ingestion_run_id TEXT PRIMARY KEY,
      source_document_id TEXT,
      canonical_source_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      document_version_id TEXT,
      extraction_run_id TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_document_versions_source_document ON document_versions (source_document_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_extraction_runs_document_version ON extraction_runs (document_version_id);
    CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_version ON meeting_participants (meeting_id, document_version_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_version ON transcript_segments (meeting_id, document_version_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_time ON transcript_segments (meeting_id, start_timestamp);
    CREATE INDEX IF NOT EXISTS idx_action_assertions_meeting ON action_assertions (meeting_id, extraction_run_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_decision_assertions_meeting ON decision_assertions (meeting_id, extraction_run_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_evidence_links_assertion ON evidence_links (assertion_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_meeting_ingestion_runs_path ON meeting_ingestion_runs (canonical_source_path, started_at DESC);
  `);
  for (const statement of [
    "ALTER TABLE task_flows ADD COLUMN sync_mode TEXT;",
    "ALTER TABLE task_flows ADD COLUMN controller_id TEXT;",
    "ALTER TABLE runtime_tasks ADD COLUMN terminal_outcome TEXT;",
    "ALTER TABLE action_assertions ADD COLUMN task_id TEXT;",
    "ALTER TABLE action_assertions ADD COLUMN details_ref TEXT;",
    "ALTER TABLE decision_assertions ADD COLUMN task_id TEXT;",
    "ALTER TABLE decision_assertions ADD COLUMN details_ref TEXT;",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Existing deployments may already have the column.
    }
  }
  return db;
}

export function ingestMeetingDocument(db: DatabaseSync, input: MeetingIngestionPayload): MeetingIngestionResult {
  const requestedSourceDocumentId = input.sourceDocumentId ?? stableId("source_document", input.canonicalSourcePath);
  const existingSource = db
    .prepare(
      `SELECT source_document_id as sourceDocumentId
       FROM source_documents
       WHERE canonical_source_path = ?
       LIMIT 1;`,
    )
    .get(input.canonicalSourcePath) as { sourceDocumentId?: string } | undefined;
  const sourceDocumentId = existingSource?.sourceDocumentId ?? requestedSourceDocumentId;
  const meetingId = input.meeting.meetingId ?? stableId("meeting", sourceDocumentId);
  const documentVersionId = stableId("document_version", sourceDocumentId, input.contentHash);
  const extractionRunId = stableId(
    "extraction_run",
    documentVersionId,
    input.extractionRun.providerRunId,
    input.extractionRun.processedAt,
    input.extractionRun.transcriptSha256,
  );
  const startedAt = input.ingestedAt;
  const existingVersion = db
    .prepare(
      `SELECT document_version_id as documentVersionId, extraction_run_id as extractionRunId
       FROM document_versions
       WHERE source_document_id = ? AND content_hash = ?
       LIMIT 1;`,
    )
    .get(sourceDocumentId, input.contentHash) as { documentVersionId?: string; extractionRunId?: string | null } | undefined;

  const insertIngestionRun = db.prepare(`
    INSERT INTO meeting_ingestion_runs (
      ingestion_run_id, source_document_id, canonical_source_path, content_hash, status,
      message, document_version_id, extraction_run_id, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  if (existingVersion?.documentVersionId) {
    const existingExtractionRunId = existingVersion.extractionRunId ?? extractionRunId;
    const ingestionRunId = stableId("ingestion_run", sourceDocumentId, input.contentHash, startedAt, "noop");
    db.exec("BEGIN;");
    try {
      const repair = repairMissingMeetingAssertionsForVersion(db, input, {
        meetingId,
        documentVersionId: existingVersion.documentVersionId,
        extractionRunId: existingExtractionRunId,
      });
      const message =
        repair.insertedActions > 0 || repair.insertedDecisions > 0 || repair.updatedMeetingCounts
          ? `source path and content hash already ingested; repaired assertions actions=${repair.insertedActions} decisions=${repair.insertedDecisions}`
          : "source path and content hash already ingested";
      db.prepare(`
        UPDATE source_documents
        SET absolute_path = ?, obsidian_ref = ?, external_source_id = ?, playback_url = ?, share_url = ?,
            last_ingested_at = ?, last_ingestion_status = ?, last_ingestion_error = NULL, updated_at = ?
        WHERE source_document_id = ?;
      `).run(
        input.absolutePath,
        input.obsidianRef,
        input.meeting.recordingId ?? null,
        input.meeting.playbackUrl ?? null,
        input.meeting.shareUrl ?? null,
        input.ingestedAt,
        "noop",
        input.ingestedAt,
        sourceDocumentId,
      );
      insertIngestionRun.run(
        ingestionRunId,
        sourceDocumentId,
        input.canonicalSourcePath,
        input.contentHash,
        "noop",
        message,
        existingVersion.documentVersionId,
        existingExtractionRunId,
        startedAt,
        input.ingestedAt,
      );
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }

    return {
      status: "noop",
      sourceDocumentId,
      meetingId,
      documentVersionId: existingVersion.documentVersionId,
      extractionRunId: existingExtractionRunId,
      participantCount: input.participants.length,
      transcriptSegmentCount: input.transcriptSegments.length,
      actionCount: input.actions.length,
      decisionCount: input.decisions.length,
    };
  }

  const upsertSourceDocument = db.prepare(`
    INSERT INTO source_documents (
      source_document_id, source_type, canonical_source_path, obsidian_ref, absolute_path,
      external_source_id, playback_url, share_url, current_version_id,
      last_ingested_at, last_ingestion_status, last_ingestion_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_source_path) DO UPDATE SET
      source_type = excluded.source_type,
      obsidian_ref = excluded.obsidian_ref,
      absolute_path = excluded.absolute_path,
      external_source_id = excluded.external_source_id,
      playback_url = excluded.playback_url,
      share_url = excluded.share_url,
      current_version_id = excluded.current_version_id,
      last_ingested_at = excluded.last_ingested_at,
      last_ingestion_status = excluded.last_ingestion_status,
      last_ingestion_error = excluded.last_ingestion_error,
      updated_at = excluded.updated_at;
  `);
  const insertDocumentVersion = db.prepare(`
    INSERT INTO document_versions (
      document_version_id, source_document_id, content_hash, raw_markdown,
      page_schema_version, captured_at, processed_at, extraction_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertExtractionRun = db.prepare(`
    INSERT INTO extraction_runs (
      extraction_run_id, source_document_id, document_version_id, provider_run_id,
      flow_id, extractor, model, prompt_hash, transcript_sha256,
      status, error_message, processed_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const upsertMeeting = db.prepare(`
    INSERT INTO meetings (
      meeting_id, source_document_id, current_document_version_id, recording_id, source_type,
      title, started_at, meeting_day, meeting_month, playback_url, share_url,
      transcript_source_path, transcript_obsidian_ref,
      participant_count, action_count, decision_count,
      last_ingested_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_document_id) DO UPDATE SET
      current_document_version_id = excluded.current_document_version_id,
      recording_id = excluded.recording_id,
      source_type = excluded.source_type,
      title = excluded.title,
      started_at = excluded.started_at,
      meeting_day = excluded.meeting_day,
      meeting_month = excluded.meeting_month,
      playback_url = excluded.playback_url,
      share_url = excluded.share_url,
      transcript_source_path = excluded.transcript_source_path,
      transcript_obsidian_ref = excluded.transcript_obsidian_ref,
      participant_count = excluded.participant_count,
      action_count = excluded.action_count,
      decision_count = excluded.decision_count,
      last_ingested_at = excluded.last_ingested_at,
      updated_at = excluded.updated_at;
  `);
  const insertParticipant = db.prepare(`
    INSERT INTO meeting_participants (
      meeting_participant_id, meeting_id, document_version_id, sequence,
      raw_name, participant_key, identity_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?);
  `);
  const insertTranscriptSegment = db.prepare(`
    INSERT INTO transcript_segments (
      transcript_segment_id, meeting_id, document_version_id, sequence,
      start_timestamp, end_timestamp, speaker_raw, speaker_identity_id, text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertActionAssertion = db.prepare(`
    INSERT INTO action_assertions (
      action_assertion_id, extraction_run_id, meeting_id, document_version_id,
      external_assertion_id, label, status, task_id, details_ref, raw_assignee, due_date, due_text,
      confidence, score, summary, evidence_text, evidence_target_time,
      fingerprint, sequence, review_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertDecisionAssertion = db.prepare(`
    INSERT INTO decision_assertions (
      decision_assertion_id, extraction_run_id, meeting_id, document_version_id,
      external_assertion_id, label, task_id, details_ref, raw_owner, confidence, score, summary,
      evidence_text, evidence_target_time, fingerprint, sequence, review_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertEvidenceLink = db.prepare(`
    INSERT INTO evidence_links (
      evidence_link_id, assertion_kind, assertion_id, transcript_segment_id,
      timestamp, quote_text, sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?);
  `);

  const transcriptSegmentIdsByTimestamp = new Map<string, string[]>();

  try {
    db.exec("BEGIN;");
    upsertSourceDocument.run(
      sourceDocumentId,
      input.sourceType,
      input.canonicalSourcePath,
      input.obsidianRef,
      input.absolutePath,
      input.meeting.recordingId ?? null,
      input.meeting.playbackUrl ?? null,
      input.meeting.shareUrl ?? null,
      documentVersionId,
      input.ingestedAt,
      "ingested",
      null,
      input.ingestedAt,
      input.ingestedAt,
    );

    insertDocumentVersion.run(
      documentVersionId,
      sourceDocumentId,
      input.contentHash,
      input.rawMarkdown,
      input.pageSchemaVersion ?? null,
      input.capturedAt,
      input.extractionRun.processedAt ?? null,
      extractionRunId,
    );

    insertExtractionRun.run(
      extractionRunId,
      sourceDocumentId,
      documentVersionId,
      input.extractionRun.providerRunId ?? null,
      input.extractionRun.flowId ?? null,
      input.extractionRun.extractor ?? null,
      input.extractionRun.model ?? null,
      input.extractionRun.promptHash ?? null,
      input.extractionRun.transcriptSha256 ?? null,
      input.extractionRun.status ?? "completed",
      input.extractionRun.errorMessage ?? null,
      input.extractionRun.processedAt ?? null,
      input.extractionRun.rawJson,
    );

    upsertMeeting.run(
      meetingId,
      sourceDocumentId,
      documentVersionId,
      input.meeting.recordingId ?? null,
      input.sourceType,
      input.meeting.title,
      input.meeting.startedAt ?? null,
      input.meeting.meetingDay ?? null,
      input.meeting.meetingMonth ?? null,
      input.meeting.playbackUrl ?? null,
      input.meeting.shareUrl ?? null,
      input.absolutePath,
      input.obsidianRef,
      input.participants.length,
      input.actions.length,
      input.decisions.length,
      input.ingestedAt,
      input.ingestedAt,
      input.ingestedAt,
    );

    for (const [index, participant] of input.participants.entries()) {
      insertParticipant.run(
        stableId("meeting_participant", meetingId, documentVersionId, String(index + 1)),
        meetingId,
        documentVersionId,
        index + 1,
        participant.rawName,
        participant.participantKey ?? null,
        participant.identityId ?? null,
      );
    }

    for (const segment of input.transcriptSegments) {
      const transcriptSegmentId = stableId(
        "transcript_segment",
        meetingId,
        documentVersionId,
        String(segment.sequence),
        segment.startTimestamp,
      );
      insertTranscriptSegment.run(
        transcriptSegmentId,
        meetingId,
        documentVersionId,
        segment.sequence,
        segment.startTimestamp,
        segment.endTimestamp ?? segment.startTimestamp,
        segment.speakerRaw,
        segment.speakerIdentityId ?? null,
        segment.text,
      );
      transcriptSegmentIdsByTimestamp.set(segment.startTimestamp, [
        ...(transcriptSegmentIdsByTimestamp.get(segment.startTimestamp) ?? []),
        transcriptSegmentId,
      ]);
    }

    for (const action of input.actions) {
      const actionAssertionId = stableId("action_assertion", extractionRunId, String(action.sequence), action.fingerprint);
      insertActionAssertion.run(
        actionAssertionId,
        extractionRunId,
        meetingId,
        documentVersionId,
        action.externalAssertionId ?? null,
        action.label,
        action.status ?? null,
        action.taskId ?? null,
        action.detailsRef ?? null,
        action.rawAssignee ?? null,
        action.dueDate ?? null,
        action.dueText ?? null,
        action.confidence ?? null,
        action.score ?? null,
        action.summary,
        action.evidenceText ?? null,
        action.evidenceTargetTime ?? null,
        action.fingerprint,
        action.sequence,
        action.reviewStatus ?? "needs_review",
        action.rawJson,
      );
      for (const [evidenceIndex, evidence] of (action.evidenceLinks ?? []).entries()) {
        insertEvidenceLink.run(
          stableId("evidence_link", actionAssertionId, String(evidenceIndex + 1), evidence.timestamp),
          "action",
          actionAssertionId,
          transcriptSegmentIdsByTimestamp.get(evidence.timestamp)?.[0] ?? null,
          evidence.timestamp,
          evidence.quoteText ?? null,
          evidenceIndex + 1,
        );
      }
    }

    for (const decision of input.decisions) {
      const decisionAssertionId = stableId("decision_assertion", extractionRunId, String(decision.sequence), decision.fingerprint);
      insertDecisionAssertion.run(
        decisionAssertionId,
        extractionRunId,
        meetingId,
        documentVersionId,
        decision.externalAssertionId ?? null,
        decision.label,
        decision.taskId ?? null,
        decision.detailsRef ?? null,
        decision.rawOwner ?? null,
        decision.confidence ?? null,
        decision.score ?? null,
        decision.summary,
        decision.evidenceText ?? null,
        decision.evidenceTargetTime ?? null,
        decision.fingerprint,
        decision.sequence,
        decision.reviewStatus ?? "needs_review",
        decision.rawJson,
      );
      for (const [evidenceIndex, evidence] of (decision.evidenceLinks ?? []).entries()) {
        insertEvidenceLink.run(
          stableId("evidence_link", decisionAssertionId, String(evidenceIndex + 1), evidence.timestamp),
          "decision",
          decisionAssertionId,
          transcriptSegmentIdsByTimestamp.get(evidence.timestamp)?.[0] ?? null,
          evidence.timestamp,
          evidence.quoteText ?? null,
          evidenceIndex + 1,
        );
      }
    }

    insertIngestionRun.run(
      stableId("ingestion_run", sourceDocumentId, input.contentHash, startedAt, "ingested"),
      sourceDocumentId,
      input.canonicalSourcePath,
      input.contentHash,
      "ingested",
      null,
      documentVersionId,
      extractionRunId,
      startedAt,
      input.ingestedAt,
    );
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    insertIngestionRun.run(
      stableId("ingestion_run", sourceDocumentId, input.contentHash, startedAt, "failed"),
      sourceDocumentId,
      input.canonicalSourcePath,
      input.contentHash,
      "failed",
      error instanceof Error ? error.message : String(error),
      documentVersionId,
      extractionRunId,
      startedAt,
      new Date().toISOString(),
    );
    throw error;
  }

  return {
    status: "ingested",
    sourceDocumentId,
    meetingId,
    documentVersionId,
    extractionRunId,
    participantCount: input.participants.length,
    transcriptSegmentCount: input.transcriptSegments.length,
    actionCount: input.actions.length,
    decisionCount: input.decisions.length,
  };
}

type AssertionParentRow = {
  meetingId: string;
};

function recalculateMeetingReviewCounts(db: DatabaseSync, meetingId: string): void {
  db.prepare(`
    UPDATE meetings
    SET
      action_count = (
        SELECT COUNT(*)
        FROM action_assertions aa
        WHERE aa.meeting_id = meetings.meeting_id
          AND aa.document_version_id = meetings.current_document_version_id
      ),
      decision_count = (
        SELECT COUNT(*)
        FROM decision_assertions da
        WHERE da.meeting_id = meetings.meeting_id
          AND da.document_version_id = meetings.current_document_version_id
      ),
      updated_at = ?
    WHERE meeting_id = ?;
  `).run(new Date().toISOString(), meetingId);
}

export function acceptMeetingAssertions(db: DatabaseSync, items: MeetingAssertionReviewItem[]): MeetingAssertionReviewResult {
  const updateAction = db.prepare(`
    UPDATE action_assertions
    SET review_status = 'accepted'
    WHERE action_assertion_id = ?
      AND review_status IN ('needs_review', 'imported');
  `);
  const updateDecision = db.prepare(`
    UPDATE decision_assertions
    SET review_status = 'accepted'
    WHERE decision_assertion_id = ?
      AND review_status IN ('needs_review', 'imported');
  `);
  let accepted = 0;

  db.exec("BEGIN;");
  try {
    for (const item of items) {
      const result = item.kind === "action" ? updateAction.run(item.assertionId) : updateDecision.run(item.assertionId);
      accepted += Number(result.changes ?? 0);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return { accepted, rejected: 0 };
}

export function rejectMeetingAssertions(db: DatabaseSync, items: MeetingAssertionReviewItem[]): MeetingAssertionReviewResult {
  const selectAction = db.prepare(`
    SELECT meeting_id as meetingId
    FROM action_assertions
    WHERE action_assertion_id = ?
    LIMIT 1;
  `);
  const selectDecision = db.prepare(`
    SELECT meeting_id as meetingId
    FROM decision_assertions
    WHERE decision_assertion_id = ?
    LIMIT 1;
  `);
  const deleteEvidence = db.prepare(`
    DELETE FROM evidence_links
    WHERE assertion_kind = ? AND assertion_id = ?;
  `);
  const deleteAction = db.prepare(`
    DELETE FROM action_assertions
    WHERE action_assertion_id = ?;
  `);
  const deleteDecision = db.prepare(`
    DELETE FROM decision_assertions
    WHERE decision_assertion_id = ?;
  `);
  const affectedMeetingIds = new Set<string>();
  let rejected = 0;

  db.exec("BEGIN;");
  try {
    for (const item of items) {
      const row = (item.kind === "action" ? selectAction : selectDecision).get(item.assertionId) as AssertionParentRow | undefined;
      if (!row) {
        continue;
      }
      deleteEvidence.run(item.kind, item.assertionId);
      const result = item.kind === "action" ? deleteAction.run(item.assertionId) : deleteDecision.run(item.assertionId);
      if (Number(result.changes ?? 0) > 0) {
        rejected += Number(result.changes ?? 0);
        affectedMeetingIds.add(row.meetingId);
      }
    }
    for (const meetingId of affectedMeetingIds) {
      recalculateMeetingReviewCounts(db, meetingId);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return { accepted: 0, rejected };
}

export function reassignActionAssertion(db: DatabaseSync, assertionId: string, assignee: string): ActionAssertionReassignmentResult {
  const trimmedAssignee = assignee.trim().replace(/\s+/gu, " ");
  if (!assertionId) {
    throw new Error("Action assertion ID is required");
  }
  if (!trimmedAssignee) {
    throw new Error("Assignee is required");
  }

  const updateAction = db.prepare(`
    UPDATE action_assertions
    SET raw_assignee = ?
    WHERE action_assertion_id = ?
      AND review_status IN ('needs_review', 'accepted', 'imported');
  `);
  const result = updateAction.run(trimmedAssignee, assertionId);
  return { reassigned: Number(result.changes ?? 0) };
}

export function isActionWorkflowStatus(value: unknown): value is ActionWorkflowStatus {
  return typeof value === "string" && (ACTION_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function updateActionAssertionStatus(db: DatabaseSync, assertionId: string, status: ActionWorkflowStatus): ActionAssertionStatusUpdateResult {
  if (!assertionId) {
    throw new Error("Action assertion ID is required");
  }
  if (!isActionWorkflowStatus(status)) {
    throw new Error(`Action status must be one of ${ACTION_WORKFLOW_STATUSES.join(", ")}`);
  }

  const result = db.prepare(`
    UPDATE action_assertions
    SET status = ?
    WHERE action_assertion_id = ?
      AND review_status IN ('accepted', 'needs_review', 'imported');
  `).run(status, assertionId);
  return { updated: Number(result.changes ?? 0), status };
}

export function markActionAssertionDone(db: DatabaseSync, assertionId: string): ActionAssertionStatusUpdateResult {
  if (!assertionId) {
    throw new Error("Action assertion ID is required");
  }

  const result = db.prepare(`
    UPDATE action_assertions
    SET review_status = 'accepted',
        status = 'done'
    WHERE action_assertion_id = ?
      AND review_status IN ('accepted', 'needs_review', 'imported');
  `).run(assertionId);
  return { updated: Number(result.changes ?? 0), status: "done" };
}

export function syncDerivedState(db: DatabaseSync, payload: DerivedStatePayload): void {
  const insertWebhook = db.prepare(`
    INSERT INTO webhook_events (
      event_id, source, event_type, route_id, flow_id, owner_agent, status,
      payload_path, correlation_id, last_error, attempt_count, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertTaskSnapshot = db.prepare(`
    INSERT INTO task_snapshots (
      id, title, board, status, owner, assignee_type, assignee, agent_status,
      created_on, remind_on, run_id, flow_id, details_ref, results_ref, log_ref,
      checked, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertRuntimeTask = db.prepare(`
    INSERT INTO runtime_tasks (
      task_id, runtime, status, agent_id, label, owner_key, source_id, run_id,
      delivery_status, terminal_summary, terminal_outcome, created_at, started_at, ended_at,
      last_event_at, cleanup_after, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertTaskFlow = db.prepare(`
    INSERT INTO task_flows (
      flow_id, sync_mode, controller_id, owner_key, goal, status, current_step, blocked_task_id,
      blocked_summary, created_at, started_at, ended_at, last_event_at, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertAuditFinding = db.prepare(`
    INSERT INTO audit_findings (
      finding_id, kind, severity, code, status, token, detail, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertMemoryHealth = db.prepare(`
    INSERT INTO memory_health (
      workspace_id, workspace_path, has_agents_md, has_memory_md, memory_dir_present,
      has_today_daily, latest_daily, qmd_healthy, qmd_message, status, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertCronJob = db.prepare(`
    INSERT INTO cron_jobs (
      job_id, name, agent_id, enabled, schedule_kind, schedule_label, session_target,
      wake_mode, last_run_status, last_run_at_ms, next_run_at_ms, last_duration_ms,
      delivery_mode, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertCronRun = db.prepare(`
    INSERT INTO cron_runs (
      run_id, job_id, ts, action, status, summary, delivered, delivery_status,
      session_id, session_key, run_at_ms, duration_ms, next_run_at_ms, model,
      provider, recorded_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const insertRoutingAttempt = db.prepare(`
    INSERT OR REPLACE INTO routing_attempts (
      routing_id, recorded_at, source_agent, source_session_id, source_message_id,
      request_group_key, request_excerpt, policy_rule_id, policy_domain,
      expected_target_agent, actual_target_agent, mechanism, tool_call_id, accepted,
      child_session_key, child_session_id, run_id, status, completion_summary,
      failure_mode, recovery_mode, compliance_status, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  try {
    db.exec("BEGIN;");
    replaceTable(db, "webhook_events");
    replaceTable(db, "task_snapshots");
    replaceTable(db, "runtime_tasks");
    replaceTable(db, "task_flows");
    replaceTable(db, "audit_findings");
    replaceTable(db, "memory_health");
    replaceTable(db, "cron_jobs");
    replaceTable(db, "cron_runs");
    replaceTable(db, "routing_attempts");

    for (const event of payload.webhookEvents) {
      insertWebhook.run(
        event.eventId,
        event.source,
        event.eventType,
        event.routeId ?? null,
        event.flowId ?? null,
        event.ownerAgent ?? null,
        event.status,
        event.payloadPath ?? null,
        event.correlationId ?? null,
        event.lastError ?? null,
        event.attemptCount,
        event.recordedAt,
        event.rawJson,
      );
    }

    for (const task of payload.taskSnapshots) {
      insertTaskSnapshot.run(
        task.id,
        task.title,
        task.board,
        task.status,
        task.owner,
        task.assigneeType,
        task.assignee,
        task.agentStatus,
        task.createdOn,
        task.remindOn,
        task.runId,
        task.flowId,
        task.detailsRef,
        task.resultsRef,
        task.logRef,
        task.checked ? 1 : 0,
        task.recordedAt,
        task.rawJson,
      );
    }

    for (const task of payload.runtimeTasks) {
      insertRuntimeTask.run(
        task.taskId,
        task.runtime ?? null,
        task.status,
        task.agentId ?? null,
        task.label ?? null,
        task.ownerKey ?? null,
        task.sourceId ?? null,
        task.runId ?? null,
        task.deliveryStatus ?? null,
        task.terminalSummary ?? null,
        task.terminalOutcome ?? null,
        task.createdAt ?? null,
        task.startedAt ?? null,
        task.endedAt ?? null,
        task.lastEventAt ?? null,
        task.cleanupAfter ?? null,
        task.recordedAt,
        task.rawJson,
      );
    }

    for (const flow of payload.taskFlows) {
      insertTaskFlow.run(
        flow.flowId,
        flow.syncMode ?? null,
        flow.controllerId ?? null,
        flow.ownerKey ?? null,
        flow.goal ?? null,
        flow.status,
        flow.currentStep ?? null,
        flow.blockedTaskId ?? null,
        flow.blockedSummary ?? null,
        flow.createdAt ?? null,
        flow.startedAt ?? null,
        flow.endedAt ?? null,
        flow.lastEventAt ?? null,
        flow.recordedAt,
        flow.rawJson,
      );
    }

    for (const finding of payload.auditFindings) {
      insertAuditFinding.run(
        finding.findingId,
        finding.kind,
        finding.severity,
        finding.code,
        finding.status ?? null,
        finding.token ?? null,
        finding.detail,
        finding.recordedAt,
        finding.rawJson,
      );
    }

    for (const workspace of payload.memoryHealth ?? []) {
      insertMemoryHealth.run(
        workspace.workspaceId,
        workspace.workspacePath,
        workspace.hasAgentsMd ? 1 : 0,
        workspace.hasMemoryMd ? 1 : 0,
        workspace.memoryDirPresent ? 1 : 0,
        workspace.hasTodayDaily ? 1 : 0,
        workspace.latestDaily,
        workspace.qmdHealthy ? 1 : 0,
        workspace.qmdMessage,
        workspace.status,
        workspace.recordedAt,
        workspace.rawJson,
      );
    }

    for (const job of payload.cronJobs ?? []) {
      insertCronJob.run(
        job.jobId,
        job.name,
        job.agentId,
        job.enabled ? 1 : 0,
        job.scheduleKind,
        job.scheduleLabel,
        job.sessionTarget ?? null,
        job.wakeMode ?? null,
        job.lastRunStatus ?? null,
        job.lastRunAtMs ?? null,
        job.nextRunAtMs ?? null,
        job.lastDurationMs ?? null,
        job.deliveryMode ?? null,
        job.recordedAt,
        job.rawJson,
      );
    }

    for (const run of payload.cronRuns ?? []) {
      insertCronRun.run(
        run.runId,
        run.jobId,
        run.ts,
        run.action,
        run.status,
        run.summary ?? null,
        run.delivered == null ? null : run.delivered ? 1 : 0,
        run.deliveryStatus ?? null,
        run.sessionId ?? null,
        run.sessionKey ?? null,
        run.runAtMs ?? null,
        run.durationMs ?? null,
        run.nextRunAtMs ?? null,
        run.model ?? null,
        run.provider ?? null,
        run.recordedAt,
        run.rawJson,
      );
    }

    for (const attempt of payload.routingAttempts ?? []) {
      insertRoutingAttempt.run(
        attempt.routingId,
        attempt.recordedAt,
        attempt.sourceAgent,
        attempt.sourceSessionId,
        attempt.sourceMessageId,
        attempt.requestGroupKey,
        attempt.requestExcerpt,
        attempt.policyRuleId ?? null,
        attempt.policyDomain ?? null,
        attempt.expectedTargetAgent ?? null,
        attempt.actualTargetAgent ?? null,
        attempt.mechanism,
        attempt.toolCallId ?? null,
        attempt.accepted == null ? null : attempt.accepted ? 1 : 0,
        attempt.childSessionKey ?? null,
        attempt.childSessionId ?? null,
        attempt.runId ?? null,
        attempt.status,
        attempt.completionSummary ?? null,
        attempt.failureMode,
        attempt.recoveryMode,
        attempt.complianceStatus,
        attempt.rawJson,
      );
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function recordMeetingIngestionFailure(db: DatabaseSync, input: MeetingIngestionFailurePayload) {
  const existingSource = db
    .prepare(
      `SELECT source_document_id as sourceDocumentId
       FROM source_documents
       WHERE canonical_source_path = ?
       LIMIT 1;`,
    )
    .get(input.canonicalSourcePath) as { sourceDocumentId?: string } | undefined;
  const sourceDocumentId = input.sourceDocumentId ?? existingSource?.sourceDocumentId ?? null;
  const contentHash = input.contentHash ?? stableId("content_hash_fallback", input.canonicalSourcePath, input.message);
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const ingestionRunId = stableId(
    "ingestion_run",
    sourceDocumentId,
    input.canonicalSourcePath,
    contentHash,
    input.startedAt,
    "failed",
  );

  if (sourceDocumentId) {
    db.prepare(`
      UPDATE source_documents
      SET last_ingested_at = ?, last_ingestion_status = ?, last_ingestion_error = ?, updated_at = ?
      WHERE source_document_id = ?;
    `).run(finishedAt, "failed", input.message, finishedAt, sourceDocumentId);
  }

  db.prepare(`
    INSERT INTO meeting_ingestion_runs (
      ingestion_run_id, source_document_id, canonical_source_path, content_hash, status,
      message, document_version_id, extraction_run_id, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(
    ingestionRunId,
    sourceDocumentId,
    input.canonicalSourcePath,
    contentHash,
    "failed",
    input.message,
    input.documentVersionId ?? null,
    input.extractionRunId ?? null,
    input.startedAt,
    finishedAt,
  );

  return ingestionRunId;
}

export function countRows(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table};`).get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}
