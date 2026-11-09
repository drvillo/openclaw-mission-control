import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
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
  webhookEvents?: EventEnvelope[];
  taskSnapshots?: TaskSnapshot[];
  runtimeTasks?: RuntimeTask[];
  taskFlows?: TaskFlow[];
  auditFindings?: AuditFinding[];
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
  ingestionRunId: string;
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

export type MyntIdentitySyncInput = {
  id: string;
  email?: string | null;
  displayName: string;
  aliases?: string[];
  isSelf?: boolean;
  source?: MyntIdentitySource;
};

export type MyntIdentitySource = "manual" | "auto" | "legacy";

export type MyntDbIdentity = {
  id: string;
  email: string;
  displayName: string;
  aliases: string[];
  isSelf: boolean;
  inferred: boolean;
  source: MyntIdentitySource;
};

export type MyntDbState = {
  version: 1;
  showSelfDefault: boolean;
  archivedItemIds: string[];
  identities: MyntDbIdentity[];
};

export type LegacyMyntStateImportResult = {
  imported: boolean;
  identities: number;
  aliases: number;
  archivedItems: number;
  settings: number;
};

const SELF_EMAIL = "francesco@lunarrails.io";
const SELF_NAME = "Francesco Vivoli";

export type AssertionAssociationSource = "meeting_participant";

export type AssertionAssociationSyncResult = {
  scannedAssertions: number;
  inserted: number;
  deleted: number;
};

export type AccountabilityConceptStatus = "active" | "dormant" | "discarded" | "merged";
export type AccountabilityConceptAssignmentSource = "auto" | "manual" | "semantic_auto";

export type AccountabilityConcept = {
  conceptId: string;
  label: string;
  summary: string;
  status: AccountabilityConceptStatus;
  mergedIntoConceptId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountabilityConceptAssignment = {
  assignmentId: string;
  conceptId: string;
  assertionKind: "action" | "decision";
  assertionId: string;
  source: AccountabilityConceptAssignmentSource;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountabilityConceptMetadata = {
  id: string;
  label: string;
  summary: string;
  status: AccountabilityConceptStatus;
  assignmentSource: AccountabilityConceptAssignmentSource;
  confidence: number | null;
};

export type AccountabilityConceptEvent = {
  conceptEventId: string;
  conceptId: string;
  eventType: string;
  payloadJson: string;
  createdAt: string;
};

export type SemanticConceptProposalReviewStatus = "pending" | "accepted" | "rejected" | "suppressed" | "merged" | "alias_added";

export type SemanticConceptSuppressionRecord = {
  suppressionId: string;
  normalizedLabel: string;
  proposalId: string | null;
  reason: string | null;
  reviewer: string | null;
  createdAt: string;
};

export type SemanticConceptProposalRecord = {
  proposalId: string;
  proposalRunId: string;
  canonicalLabelSuggestion: string;
  definition: string;
  whyItMatters: string;
  scope: string;
  confidence: number;
  registryAction: string;
  existingConceptId: string | null;
  aliasesSuggested: string[];
  linkedActionIds: string[];
  linkedDecisionIds: string[];
  linkedEvidenceWindowIds: string[];
  reviewStatus: SemanticConceptProposalReviewStatus;
  targetConceptId: string | null;
  applyReady: boolean;
  missingTargets: string[];
  rawJson: string;
  importedAt: string;
  reviewedAt: string | null;
};

export type SemanticConceptProposalRunRecord = {
  proposalRunId: string;
  sourceWindowJson: string;
  indexVersion: string;
  registrySnapshotVersion: string;
  promptVersionJson: string;
  generatedAt: string;
  importedAt: string;
  diagnosticsJson: string;
  rawJson: string;
  proposals: SemanticConceptProposalRecord[];
};

export type SemanticProposalImportResult = {
  proposalRunId: string;
  proposalsImported: number;
  evidencePacketsImported: number;
  proposalsSkipped?: number;
  diagnostics?: string[];
};

export type SemanticProposalApplyResult = {
  proposalId: string;
  decision: "accept" | "reject" | "merge" | "add_alias";
  concept: AccountabilityConcept | null;
  assignmentsCreatedOrUpdated: number;
};

export type SemanticProposalAutoApplyResult = {
  scanned: number;
  applied: number;
  skipped: number;
  proposalRunId: string | null;
  appliedProposalIds: string[];
  skippedProposalIds: string[];
};

export type SemanticAutoApplyResult = {
  considered: number;
  applied: number;
  pending: number;
  skipped: number;
  appliedProposalIds: string[];
};

export type SemanticSuppressionResult = {
  proposalId: string;
  suppressionId: string;
  suppressed: boolean;
};

export type SemanticRefreshRunStatus = "running" | "completed" | "failed";

export type SemanticRefreshRunRecord = {
  semanticRefreshRunId: string;
  status: SemanticRefreshRunStatus;
  trigger: string;
  source: string | null;
  sourceDocumentId: string | null;
  documentVersionId: string | null;
  ingestionRunId: string | null;
  indexVersionId: string | null;
  proposalRunId: string | null;
  proposalsImported: number;
  autoApplied: number;
  pending: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type MeetingIngestionSemanticResultInput = {
  status: "skipped" | "succeeded" | "failed";
  message?: string | null;
  proposalRunId?: string | null;
  autoAppliedCount?: number | null;
  finishedAt?: string | null;
};

export type SemanticAssertionCandidateResolutionInput = {
  candidateId: string;
  kind: "action" | "decision" | string;
  text?: string | null;
  normalizedText?: string | null;
  sourceRef?: {
    canonicalSourcePath?: string | null;
    contentHash?: string | null;
    recordingId?: string | null;
    missionControlId?: string | null;
    sourceId?: string | null;
  } | null;
};

export type SemanticAssertionCandidateResolution = {
  candidateId: string;
  kind: "action" | "decision";
  assertionId: string | null;
  method: "already_mc_id" | "mission_control_id" | "source_text" | "global_text" | "unresolved";
  ambiguous: boolean;
};

export type SemanticProposalRunResolutionResult = {
  proposalRun: Record<string, unknown>;
  resolutions: SemanticAssertionCandidateResolution[];
  unresolved: string[];
};

export type SemanticProposalTargetResolution = {
  proposalId: string;
  applyReady: boolean;
  missingTargets: string[];
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

function normalizeIdentityValue(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");
}

function identityLookupKey(value: string | null | undefined) {
  return normalizeIdentityValue(value).toLowerCase();
}

type ParsedIdentityValue = {
  raw: string;
  displayName: string;
  email: string | null;
};

function parseIdentityValue(rawValue: string | null | undefined): ParsedIdentityValue | null {
  const raw = normalizeIdentityValue(rawValue);
  if (!raw || raw.toLowerCase() === "unclear" || raw.toLowerCase() === "none") {
    return null;
  }
  const bracket = raw.match(/^(.+?)\s*<([^<>\s]+@[^<>\s]+)>$/u);
  if (bracket) {
    return { raw, displayName: normalizeIdentityValue(bracket[1]), email: bracket[2].toLowerCase() };
  }
  const email = raw.match(/[^\s<>]+@[^\s<>]+\.[^\s<>]+/u)?.[0]?.toLowerCase() ?? null;
  return { raw, displayName: email && raw === email ? email : raw.replace(email ?? "", "").trim() || raw, email };
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeIdentityValue).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function identityIdForName(value: string) {
  return `name:${identityLookupKey(value)}`;
}

function isLikelyFullName(value: string) {
  const parsed = parseIdentityValue(value);
  if (!parsed || parsed.email) {
    return false;
  }
  const tokens = parsed.displayName.split(/\s+/u).filter((token) => /\p{L}/u.test(token));
  return tokens.length >= 2 && !/[&,/]/u.test(parsed.displayName);
}

function normalizeIdentitySource(value: string | null | undefined): MyntIdentitySource {
  return value === "manual" || value === "auto" || value === "legacy" ? value : "legacy";
}

function aliasTypeForValue(value: string) {
  const parsed = parseIdentityValue(value);
  return parsed?.email && identityLookupKey(value) === parsed.email ? "email" : "name";
}

export function ensureMyntStateSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS identities (
      identity_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      primary_email TEXT,
      is_self INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'legacy',
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

    CREATE TABLE IF NOT EXISTS mynt_archived_items (
      item_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mynt_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_identity_aliases_value ON identity_aliases (alias_value);
    CREATE INDEX IF NOT EXISTS idx_identity_aliases_identity ON identity_aliases (identity_id);
  `);
  try {
    db.exec("ALTER TABLE identities ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';");
  } catch {
    // Existing deployments may already have the column.
  }
}

function upsertMyntIdentity(db: DatabaseSync, input: MyntIdentitySyncInput, source: MyntIdentitySource, now: string) {
  ensureMyntStateSchema(db);
  const identityId = normalizeIdentityValue(input.id || input.email || input.displayName);
  const displayName = normalizeIdentityValue(input.displayName || input.email || input.id);
  if (!identityId || !displayName) {
    return { identityId: null, aliases: 0 };
  }

  const email = normalizeIdentityValue(input.email).toLowerCase();
  db.prepare(`
    INSERT INTO identities (identity_id, display_name, primary_email, is_self, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_id) DO UPDATE SET
      display_name = excluded.display_name,
      primary_email = excluded.primary_email,
      is_self = excluded.is_self,
      source = CASE
        WHEN identities.source = 'manual' THEN identities.source
        ELSE excluded.source
      END,
      updated_at = excluded.updated_at;
  `).run(identityId, displayName, email || null, input.isSelf ? 1 : 0, source, now, now);

  let aliases = 0;
  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO identity_aliases (identity_alias_id, identity_id, alias_type, alias_value, created_at)
    VALUES (?, ?, ?, ?, ?);
  `);
  for (const aliasValue of uniqueNormalized([displayName, email, ...(input.aliases ?? [])])) {
    const parsed = parseIdentityValue(aliasValue);
    const normalizedAlias = parsed?.email && parsed.raw === parsed.email ? parsed.email : aliasValue;
    const aliasType = aliasTypeForValue(normalizedAlias);
    aliases += Number(
      insertAlias.run(stableId("identity_alias", identityId, aliasType, normalizedAlias), identityId, aliasType, normalizedAlias, now).changes ?? 0,
    );
  }
  if (email) {
    aliases += Number(insertAlias.run(stableId("identity_alias", identityId, "email", email), identityId, "email", email, now).changes ?? 0);
  }
  return { identityId, aliases };
}

export function seedMyntSelfIdentity(db: DatabaseSync, now = new Date().toISOString()): void {
  upsertMyntIdentity(
    db,
    {
      id: SELF_EMAIL,
      email: SELF_EMAIL,
      displayName: SELF_NAME,
      aliases: [SELF_NAME, SELF_EMAIL],
      isSelf: true,
      source: "manual",
    },
    "manual",
    now,
  );
}

function countMatchingIdentityIds(db: DatabaseSync, parsed: ParsedIdentityValue) {
  const ids = new Set<string>();
  if (parsed.email) {
    const rows = db
      .prepare(
        `SELECT identity_id as identityId
         FROM identities
         WHERE lower(COALESCE(primary_email, '')) = ?
         UNION
         SELECT identity_id as identityId
         FROM identity_aliases
         WHERE alias_type = 'email'
           AND lower(alias_value) = ?;`,
      )
      .all(parsed.email, parsed.email) as Array<{ identityId?: string }>;
    for (const row of rows) {
      if (row.identityId) {
        ids.add(row.identityId);
      }
    }
  }

  const aliasKey = identityLookupKey(parsed.displayName);
  if (aliasKey) {
    const rows = db
      .prepare(
        `SELECT identity_id as identityId
         FROM identity_aliases
         WHERE lower(alias_value) = ?;`,
      )
      .all(aliasKey) as Array<{ identityId?: string }>;
    for (const row of rows) {
      if (row.identityId) {
        ids.add(row.identityId);
      }
    }
  }
  return ids;
}

export function resolveMyntIdentityIdForRawValue(db: DatabaseSync, rawValue: string | null | undefined): string | null {
  ensureMyntStateSchema(db);
  const parsed = parseIdentityValue(rawValue);
  if (!parsed) {
    return null;
  }
  const ids = countMatchingIdentityIds(db, parsed);
  return ids.size === 1 ? [...ids][0] : null;
}

export function bootstrapMyntIdentitiesFromRawValues(
  db: DatabaseSync,
  rawValues: Array<string | null | undefined>,
  now = new Date().toISOString(),
): { identities: number; aliases: number } {
  ensureMyntStateSchema(db);
  seedMyntSelfIdentity(db, now);
  let identities = 0;
  let aliases = 0;
  const seenAutoIds = new Set<string>();

  for (const rawValue of rawValues) {
    const parsed = parseIdentityValue(rawValue);
    if (!parsed) {
      continue;
    }
    if (countMatchingIdentityIds(db, parsed).size > 0) {
      continue;
    }

    const input: MyntIdentitySyncInput | null = parsed.email
      ? {
          id: parsed.email,
          email: parsed.email,
          displayName: parsed.displayName || parsed.email,
          aliases: uniqueNormalized([parsed.raw, parsed.displayName, parsed.email]),
          isSelf: parsed.email === SELF_EMAIL,
          source: "auto",
        }
      : isLikelyFullName(parsed.displayName)
        ? {
            id: identityIdForName(parsed.displayName),
            email: null,
            displayName: parsed.displayName,
            aliases: [parsed.displayName],
            isSelf: identityLookupKey(parsed.displayName) === identityLookupKey(SELF_NAME),
            source: "auto",
          }
        : null;

    if (!input || seenAutoIds.has(input.id)) {
      continue;
    }
    seenAutoIds.add(input.id);
    const result = upsertMyntIdentity(db, input, "auto", now);
    if (result.identityId) {
      identities += 1;
      aliases += result.aliases;
    }
  }

  return { identities, aliases };
}

export function bootstrapMyntIdentitiesFromCurrentMeetings(db: DatabaseSync, now = new Date().toISOString()) {
  ensureMyntStateSchema(db);
  const rows = db
    .prepare(
      `SELECT mp.raw_name as rawValue
       FROM meetings m
       JOIN meeting_participants mp
         ON mp.meeting_id = m.meeting_id
        AND mp.document_version_id = m.current_document_version_id
       UNION ALL
       SELECT aa.raw_assignee as rawValue
       FROM meetings m
       JOIN action_assertions aa
         ON aa.meeting_id = m.meeting_id
        AND aa.document_version_id = m.current_document_version_id
       UNION ALL
       SELECT da.raw_owner as rawValue
       FROM meetings m
       JOIN decision_assertions da
         ON da.meeting_id = m.meeting_id
        AND da.document_version_id = m.current_document_version_id;`,
    )
    .all() as Array<{ rawValue?: string | null }>;
  const result = bootstrapMyntIdentitiesFromRawValues(
    db,
    rows.map((row) => row.rawValue),
    now,
  );
  backfillMyntIdentityReferences(db);
  return result;
}

export function backfillMyntIdentityReferences(db: DatabaseSync): { participants: number; transcriptSpeakers: number } {
  ensureMyntStateSchema(db);
  let participants = 0;
  let transcriptSpeakers = 0;
  const participantRows = db
    .prepare(
      `SELECT meeting_participant_id as id, raw_name as rawName
       FROM meeting_participants;`,
    )
    .all() as Array<{ id?: string; rawName?: string }>;
  const updateParticipant = db.prepare("UPDATE meeting_participants SET identity_id = ? WHERE meeting_participant_id = ?;");
  for (const row of participantRows) {
    const identityId = resolveMyntIdentityIdForRawValue(db, row.rawName);
    if (row.id) {
      participants += Number(updateParticipant.run(identityId, row.id).changes ?? 0);
    }
  }

  const speakerRows = db
    .prepare(
      `SELECT transcript_segment_id as id, speaker_raw as speakerRaw
       FROM transcript_segments;`,
    )
    .all() as Array<{ id?: string; speakerRaw?: string }>;
  const updateSpeaker = db.prepare("UPDATE transcript_segments SET speaker_identity_id = ? WHERE transcript_segment_id = ?;");
  for (const row of speakerRows) {
    const identityId = resolveMyntIdentityIdForRawValue(db, row.speakerRaw);
    if (row.id) {
      transcriptSpeakers += Number(updateSpeaker.run(identityId, row.id).changes ?? 0);
    }
  }
  return { participants, transcriptSpeakers };
}

export function loadMyntStateFromDb(db: DatabaseSync): MyntDbState {
  ensureMyntStateSchema(db);
  seedMyntSelfIdentity(db);
  const identityRows = db
    .prepare(
      `SELECT identity_id as id,
              display_name as displayName,
              COALESCE(primary_email, '') as email,
              is_self as isSelf,
              source as source
       FROM identities
       ORDER BY display_name, identity_id;`,
    )
    .all() as Array<{ id: string; displayName: string; email: string; isSelf: number; source?: string | null }>;
  const aliasRows = db
    .prepare(
      `SELECT identity_id as identityId, alias_value as aliasValue
       FROM identity_aliases
       ORDER BY identity_id, alias_value;`,
    )
    .all() as Array<{ identityId?: string; aliasValue?: string }>;
  const aliasesByIdentity = new Map<string, string[]>();
  for (const row of aliasRows) {
    if (row.identityId && row.aliasValue) {
      aliasesByIdentity.set(row.identityId, [...(aliasesByIdentity.get(row.identityId) ?? []), row.aliasValue]);
    }
  }
  const archivedRows = db
    .prepare("SELECT item_id as itemId FROM mynt_archived_items ORDER BY item_id;")
    .all() as Array<{ itemId?: string }>;
  const settingRow = db
    .prepare("SELECT setting_value as value FROM mynt_settings WHERE setting_key = 'showSelfDefault' LIMIT 1;")
    .get() as { value?: string } | undefined;

  return {
    version: 1,
    showSelfDefault: settingRow?.value === "true",
    archivedItemIds: uniqueNormalized(archivedRows.map((row) => row.itemId)),
    identities: identityRows.map((identity) => {
      const source = normalizeIdentitySource(identity.source);
      const aliases = uniqueNormalized([...(aliasesByIdentity.get(identity.id) ?? []), identity.displayName, identity.email]);
      return {
        id: identity.id,
        email: identity.email,
        displayName: identity.displayName,
        aliases,
        isSelf: Boolean(identity.isSelf) || identity.email.toLowerCase() === SELF_EMAIL,
        inferred: source === "auto",
        source,
      };
    }),
  };
}

export function importLegacyMyntStateFile(
  db: DatabaseSync,
  statePath: string,
  now = new Date().toISOString(),
): LegacyMyntStateImportResult {
  ensureMyntStateSchema(db);
  seedMyntSelfIdentity(db, now);
  if (!existsSync(statePath)) {
    return { imported: false, identities: 0, aliases: 0, archivedItems: 0, settings: 0 };
  }
  const raw = JSON.parse(readFileSync(statePath, "utf8")) as {
    identities?: unknown;
    archivedItemIds?: unknown;
    showSelfDefault?: unknown;
  };
  const identities = Array.isArray(raw.identities)
    ? raw.identities
        .map((identity) => identity as { id?: unknown; email?: unknown; displayName?: unknown; aliases?: unknown; isSelf?: unknown; inferred?: unknown })
        .filter((identity) => Boolean(identity.id && identity.displayName))
        .map(
          (identity): MyntIdentitySyncInput => ({
            id: String(identity.id),
            email: identity.email ? String(identity.email) : null,
            displayName: String(identity.displayName),
            aliases: Array.isArray(identity.aliases) ? identity.aliases.map(String) : [],
            isSelf: Boolean(identity.isSelf),
            source: identity.inferred ? "auto" : "legacy",
          }),
        )
    : [];

  let identityCount = 0;
  let aliasCount = 0;
  let archivedItems = 0;
  let settings = 0;
  db.exec("BEGIN;");
  try {
    for (const identity of identities) {
      const result = upsertMyntIdentity(db, identity, normalizeIdentitySource(identity.source), now);
      if (result.identityId) {
        identityCount += 1;
        aliasCount += result.aliases;
      }
    }
    const insertArchive = db.prepare("INSERT OR IGNORE INTO mynt_archived_items (item_id, archived_at) VALUES (?, ?);");
    if (Array.isArray(raw.archivedItemIds)) {
      for (const itemId of uniqueNormalized(raw.archivedItemIds.map(String))) {
        archivedItems += Number(insertArchive.run(itemId, now).changes ?? 0);
      }
    }
    db.prepare(
      `INSERT INTO mynt_settings (setting_key, setting_value, updated_at)
       VALUES ('showSelfDefault', ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = excluded.updated_at;`,
    ).run(Boolean(raw.showSelfDefault) ? "true" : "false", now);
    settings = 1;
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  unlinkSync(statePath);
  return { imported: true, identities: identityCount, aliases: aliasCount, archivedItems, settings };
}

export function archiveMyntItemIdsInDb(db: DatabaseSync, ids: string[], now = new Date().toISOString()): string[] {
  ensureMyntStateSchema(db);
  const insertArchive = db.prepare("INSERT OR IGNORE INTO mynt_archived_items (item_id, archived_at) VALUES (?, ?);");
  for (const id of uniqueNormalized(ids)) {
    insertArchive.run(id, now);
  }
  return (db.prepare("SELECT item_id as itemId FROM mynt_archived_items ORDER BY item_id;").all() as Array<{ itemId?: string }>)
    .map((row) => row.itemId)
    .filter((itemId): itemId is string => Boolean(itemId));
}

export function approveMyntAliasInDb(
  db: DatabaseSync,
  identityId: string,
  rawAlias: string,
  identityDisplayName?: string,
  now = new Date().toISOString(),
): MyntDbIdentity {
  ensureMyntStateSchema(db);
  const parsed = parseIdentityValue(rawAlias);
  if (!parsed) {
    throw new Error("Alias is required");
  }
  const normalizedIdentityId = normalizeIdentityValue(identityId);
  let identity = db
    .prepare("SELECT identity_id as id, display_name as displayName, primary_email as email FROM identities WHERE identity_id = ? OR primary_email = ? LIMIT 1;")
    .get(normalizedIdentityId, normalizedIdentityId) as { id?: string; displayName?: string; email?: string | null } | undefined;

  const inferredEmail = parseIdentityValue(normalizedIdentityId)?.email;
  if (!identity && (normalizedIdentityId.startsWith("name:") || inferredEmail)) {
    const displayName = normalizeIdentityValue(identityDisplayName || (inferredEmail ? normalizedIdentityId : normalizedIdentityId.slice("name:".length)));
    upsertMyntIdentity(
      db,
      {
        id: normalizedIdentityId,
        email: inferredEmail ?? null,
        displayName,
        aliases: uniqueNormalized([displayName, inferredEmail ?? ""]),
        isSelf: inferredEmail === SELF_EMAIL || identityLookupKey(displayName) === identityLookupKey(SELF_NAME),
        source: "manual",
      },
      "manual",
      now,
    );
    identity = { id: normalizedIdentityId, displayName, email: inferredEmail ?? null };
  }
  if (!identity?.id) {
    throw new Error(`Unknown identity: ${identityId}`);
  }

  db.exec("BEGIN;");
  try {
    const aliasValues = uniqueNormalized([parsed.raw, parsed.displayName, parsed.email ?? ""]);
    for (const aliasValue of aliasValues) {
      const aliasKey = identityLookupKey(aliasValue);
      if (!aliasKey) {
        continue;
      }
      db.prepare("DELETE FROM identity_aliases WHERE identity_id <> ? AND lower(alias_value) = ?;").run(identity.id, aliasKey);
      const aliasType = aliasTypeForValue(aliasValue);
      db.prepare(
        `INSERT OR IGNORE INTO identity_aliases (identity_alias_id, identity_id, alias_type, alias_value, created_at)
         VALUES (?, ?, ?, ?, ?);`,
      ).run(stableId("identity_alias", identity.id, aliasType, aliasValue), identity.id, aliasType, aliasValue, now);
    }
    if (parsed.email && !identity.email) {
      db.prepare("UPDATE identities SET primary_email = ?, source = 'manual', updated_at = ? WHERE identity_id = ?;").run(parsed.email, now, identity.id);
    } else {
      db.prepare("UPDATE identities SET source = 'manual', updated_at = ? WHERE identity_id = ?;").run(now, identity.id);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return loadMyntStateFromDb(db).identities.find((item) => item.id === identity.id)!;
}

export function updateMyntIdentityEmailInDb(
  db: DatabaseSync,
  identityId: string,
  rawEmail: string,
  identityDisplayName?: string,
  now = new Date().toISOString(),
): MyntDbIdentity {
  ensureMyntStateSchema(db);
  const email = normalizeIdentityValue(rawEmail).toLowerCase();
  if (email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(email)) {
    throw new Error("Enter a valid email address");
  }

  const normalizedIdentityId = normalizeIdentityValue(identityId);
  let identity = db
    .prepare("SELECT identity_id as id, display_name as displayName, primary_email as email FROM identities WHERE identity_id = ? OR primary_email = ? LIMIT 1;")
    .get(normalizedIdentityId, normalizedIdentityId) as { id?: string; displayName?: string; email?: string | null } | undefined;
  const inferredEmail = parseIdentityValue(normalizedIdentityId)?.email;
  if (!identity && (normalizedIdentityId.startsWith("name:") || inferredEmail)) {
    const displayName = normalizeIdentityValue(identityDisplayName || (inferredEmail ? normalizedIdentityId : normalizedIdentityId.slice("name:".length)));
    upsertMyntIdentity(
      db,
      {
        id: normalizedIdentityId,
        email: inferredEmail ?? null,
        displayName,
        aliases: uniqueNormalized([displayName, inferredEmail ?? ""]),
        isSelf: inferredEmail === SELF_EMAIL || identityLookupKey(displayName) === identityLookupKey(SELF_NAME),
        source: "manual",
      },
      "manual",
      now,
    );
    identity = { id: normalizedIdentityId, displayName, email: inferredEmail ?? null };
  }
  if (!identity?.id) {
    throw new Error(`Unknown identity: ${identityId}`);
  }

  if (email) {
    const conflicts = countMatchingIdentityIds(db, { raw: email, displayName: email, email });
    conflicts.delete(identity.id);
    if (conflicts.size > 0) {
      const conflictingIdentity = db
        .prepare("SELECT display_name as displayName FROM identities WHERE identity_id = ? LIMIT 1;")
        .get([...conflicts][0]) as { displayName?: string } | undefined;
      throw new Error(`Email is already assigned to ${conflictingIdentity?.displayName ?? "another identity"}`);
    }
  }

  db.exec("BEGIN;");
  try {
    const previousEmail = normalizeIdentityValue(identity.email).toLowerCase();
    if (previousEmail) {
      db.prepare("DELETE FROM identity_aliases WHERE identity_id = ? AND alias_type = 'email' AND lower(alias_value) = ?;").run(identity.id, previousEmail);
    }
    db.prepare("UPDATE identities SET primary_email = ?, source = 'manual', updated_at = ? WHERE identity_id = ?;").run(email || null, now, identity.id);
    if (email) {
      db.prepare("DELETE FROM identity_aliases WHERE identity_id <> ? AND lower(alias_value) = ?;").run(identity.id, email);
      db.prepare(
        `INSERT OR IGNORE INTO identity_aliases (identity_alias_id, identity_id, alias_type, alias_value, created_at)
         VALUES (?, ?, 'email', ?, ?);`,
      ).run(stableId("identity_alias", identity.id, "email", email), identity.id, email, now);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return loadMyntStateFromDb(db).identities.find((item) => item.id === identity.id)!;
}

export function ensureAssertionAssociationSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assertion_associations (
      assertion_association_id TEXT PRIMARY KEY,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(assertion_kind, assertion_id, identity_id, source)
    );

    CREATE INDEX IF NOT EXISTS idx_assertion_associations_assertion ON assertion_associations (assertion_kind, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_meeting_version ON assertion_associations (meeting_id, document_version_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_identity ON assertion_associations (identity_id);
  `);
}

export function ensureAccountabilityConceptSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accountability_concepts (
      concept_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      merged_into_concept_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accountability_concept_assignments (
      assignment_id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(assertion_kind, assertion_id)
    );

    CREATE TABLE IF NOT EXISTS accountability_concept_events (
      concept_event_id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_accountability_concepts_status ON accountability_concepts (status, label);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_assignments_concept ON accountability_concept_assignments (concept_id);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_assignments_assertion ON accountability_concept_assignments (assertion_kind, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_events_concept ON accountability_concept_events (concept_id, created_at);
  `);
}

function normalizeConceptStatus(value: string | null | undefined): AccountabilityConceptStatus {
  return value === "active" || value === "dormant" || value === "discarded" || value === "merged" ? value : "active";
}

function normalizeConceptAssignmentSource(value: string | null | undefined): AccountabilityConceptAssignmentSource {
  return value === "manual" || value === "semantic_auto" ? value : "auto";
}

function conceptRow(row: {
  conceptId: string;
  label: string;
  summary: string | null;
  status: string | null;
  mergedIntoConceptId: string | null;
  createdAt: string;
  updatedAt: string;
}): AccountabilityConcept {
  return {
    conceptId: row.conceptId,
    label: row.label,
    summary: row.summary ?? "",
    status: normalizeConceptStatus(row.status),
    mergedIntoConceptId: row.mergedIntoConceptId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createAccountabilityConcept(
  db: DatabaseSync,
  input: { conceptId?: string | null; label: string; summary?: string | null; status?: AccountabilityConceptStatus },
  now = new Date().toISOString(),
): AccountabilityConcept {
  ensureAccountabilityConceptSchema(db);
  const label = normalizeIdentityValue(input.label);
  if (!label) {
    throw new Error("Concept label is required");
  }
  const summary = String(input.summary ?? "").trim();
  const status = input.status ?? "active";
  const conceptId = input.conceptId?.trim() || stableId("accountability_concept", label.toLowerCase());
  db.prepare(`
    INSERT INTO accountability_concepts (concept_id, label, summary, status, merged_into_concept_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(concept_id) DO UPDATE SET
      label = excluded.label,
      summary = excluded.summary,
      status = CASE
        WHEN accountability_concepts.status = 'merged' THEN accountability_concepts.status
        ELSE excluded.status
      END,
      updated_at = excluded.updated_at;
  `).run(conceptId, label, summary, status, now, now);
  return getAccountabilityConcept(db, conceptId)!;
}

export function getAccountabilityConcept(db: DatabaseSync, conceptId: string): AccountabilityConcept | null {
  ensureAccountabilityConceptSchema(db);
  const row = db
    .prepare(
      `SELECT concept_id as conceptId,
              label,
              summary,
              status,
              merged_into_concept_id as mergedIntoConceptId,
              created_at as createdAt,
              updated_at as updatedAt
       FROM accountability_concepts
       WHERE concept_id = ?
       LIMIT 1;`,
    )
    .get(conceptId) as Parameters<typeof conceptRow>[0] | undefined;
  return row ? conceptRow(row) : null;
}

export function listAccountabilityConcepts(db: DatabaseSync, statuses?: AccountabilityConceptStatus[]): AccountabilityConcept[] {
  ensureAccountabilityConceptSchema(db);
  const allowedStatuses = statuses?.length ? statuses : ["active", "dormant", "discarded", "merged"];
  const placeholders = allowedStatuses.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT concept_id as conceptId,
              label,
              summary,
              status,
              merged_into_concept_id as mergedIntoConceptId,
              created_at as createdAt,
              updated_at as updatedAt
       FROM accountability_concepts
       WHERE status IN (${placeholders})
       ORDER BY status, lower(label), concept_id;`,
    )
    .all(...allowedStatuses) as Array<Parameters<typeof conceptRow>[0]>;
  return rows.map(conceptRow);
}

export function recordAccountabilityConceptEvent(
  db: DatabaseSync,
  input: { conceptId: string; eventType: string; payload?: unknown; eventId?: string | null },
  now = new Date().toISOString(),
): AccountabilityConceptEvent {
  ensureAccountabilityConceptSchema(db);
  if (!input.conceptId) {
    throw new Error("Concept ID is required");
  }
  if (!input.eventType) {
    throw new Error("Concept event type is required");
  }
  const payloadJson = JSON.stringify(input.payload ?? {});
  const conceptEventId = input.eventId?.trim() || `accountability_concept_event_${randomUUID()}`;
  db.prepare(`
    INSERT INTO accountability_concept_events (concept_event_id, concept_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?);
  `).run(conceptEventId, input.conceptId, input.eventType, payloadJson, now);
  return { conceptEventId, conceptId: input.conceptId, eventType: input.eventType, payloadJson, createdAt: now };
}

export function updateAccountabilityConcept(
  db: DatabaseSync,
  input: { conceptId: string; label?: string | null; summary?: string | null; status?: AccountabilityConceptStatus },
  now = new Date().toISOString(),
): AccountabilityConcept {
  ensureAccountabilityConceptSchema(db);
  const current = getAccountabilityConcept(db, input.conceptId);
  if (!current) {
    throw new Error("Concept not found");
  }
  const label = input.label == null ? current.label : normalizeIdentityValue(input.label);
  if (!label) {
    throw new Error("Concept label is required");
  }
  const summary = input.summary == null ? current.summary : String(input.summary).trim();
  const status = input.status ?? current.status;
  db.prepare(`
    UPDATE accountability_concepts
    SET label = ?, summary = ?, status = ?, updated_at = ?
    WHERE concept_id = ?;
  `).run(label, summary, status, now, input.conceptId);
  recordAccountabilityConceptEvent(db, { conceptId: input.conceptId, eventType: "update", payload: { label, summary, status } }, now);
  return getAccountabilityConcept(db, input.conceptId)!;
}

export function discardAccountabilityConcept(db: DatabaseSync, conceptId: string, now = new Date().toISOString()): AccountabilityConcept {
  const concept = updateAccountabilityConcept(db, { conceptId, status: "discarded" }, now);
  recordAccountabilityConceptEvent(db, { conceptId, eventType: "discard", payload: { conceptId } }, now);
  return concept;
}

export function assignAssertionConcept(
  db: DatabaseSync,
  input: {
    conceptId: string;
    assertionKind: "action" | "decision";
    assertionId: string;
    source: AccountabilityConceptAssignmentSource;
    confidence?: number | null;
    eventPayload?: Record<string, unknown>;
  },
  now = new Date().toISOString(),
): AccountabilityConceptAssignment {
  ensureAccountabilityConceptSchema(db);
  if (!getAccountabilityConcept(db, input.conceptId)) {
    throw new Error("Concept not found");
  }
  if (input.assertionKind !== "action" && input.assertionKind !== "decision") {
    throw new Error("Assertion kind must be action or decision");
  }
  if (!input.assertionId) {
    throw new Error("Assertion ID is required");
  }
  const assignmentId = stableId("accountability_concept_assignment", input.assertionKind, input.assertionId);
  db.prepare(`
    INSERT INTO accountability_concept_assignments (
      assignment_id, concept_id, assertion_kind, assertion_id, source, confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assertion_kind, assertion_id) DO UPDATE SET
      concept_id = excluded.concept_id,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at;
  `).run(
    assignmentId,
    input.conceptId,
    input.assertionKind,
    input.assertionId,
    input.source,
    input.confidence ?? null,
    now,
    now,
  );
  recordAccountabilityConceptEvent(
    db,
    {
      conceptId: input.conceptId,
      eventType: input.source === "manual" ? "assign_assertion" : input.source === "semantic_auto" ? "semantic_auto_assign_assertion" : "auto_assign_assertion",
      payload: { assertionKind: input.assertionKind, assertionId: input.assertionId, confidence: input.confidence ?? null, ...(input.eventPayload ?? {}) },
    },
    now,
  );
  const row = db
    .prepare(
      `SELECT assignment_id as assignmentId,
              concept_id as conceptId,
              assertion_kind as assertionKind,
              assertion_id as assertionId,
              source,
              confidence,
              created_at as createdAt,
              updated_at as updatedAt
       FROM accountability_concept_assignments
       WHERE assertion_kind = ? AND assertion_id = ?;`,
    )
    .get(input.assertionKind, input.assertionId) as AccountabilityConceptAssignment | undefined;
  if (!row) {
    throw new Error("Concept assignment failed");
  }
  return { ...row, source: normalizeConceptAssignmentSource(row.source), confidence: row.confidence == null ? null : Number(row.confidence) };
}

export function clearAssertionConcept(
  db: DatabaseSync,
  assertionKind: "action" | "decision",
  assertionId: string,
  now = new Date().toISOString(),
): { cleared: number } {
  ensureAccountabilityConceptSchema(db);
  const current = db
    .prepare(`SELECT concept_id as conceptId FROM accountability_concept_assignments WHERE assertion_kind = ? AND assertion_id = ? LIMIT 1;`)
    .get(assertionKind, assertionId) as { conceptId?: string } | undefined;
  const result = db.prepare(`DELETE FROM accountability_concept_assignments WHERE assertion_kind = ? AND assertion_id = ?;`).run(assertionKind, assertionId);
  if (current?.conceptId) {
    recordAccountabilityConceptEvent(db, { conceptId: current.conceptId, eventType: "clear_assertion", payload: { assertionKind, assertionId } }, now);
  }
  return { cleared: Number(result.changes ?? 0) };
}

export function mergeAccountabilityConcepts(
  db: DatabaseSync,
  input: { fromConceptId: string; toConceptId: string },
  now = new Date().toISOString(),
): { movedAssignments: number; from: AccountabilityConcept; to: AccountabilityConcept } {
  ensureAccountabilityConceptSchema(db);
  if (!input.fromConceptId || !input.toConceptId || input.fromConceptId === input.toConceptId) {
    throw new Error("Merge requires two different concept IDs");
  }
  const from = getAccountabilityConcept(db, input.fromConceptId);
  const to = getAccountabilityConcept(db, input.toConceptId);
  if (!from || !to) {
    throw new Error("Merge concepts must both exist");
  }
  let movedAssignments = 0;
  db.exec("BEGIN;");
  try {
    movedAssignments = Number(
      db
        .prepare(`UPDATE accountability_concept_assignments SET concept_id = ?, updated_at = ? WHERE concept_id = ?;`)
        .run(input.toConceptId, now, input.fromConceptId).changes ?? 0,
    );
    db.prepare(`UPDATE accountability_concepts SET status = 'merged', merged_into_concept_id = ?, updated_at = ? WHERE concept_id = ?;`).run(
      input.toConceptId,
      now,
      input.fromConceptId,
    );
    db.prepare(`UPDATE accountability_concepts SET updated_at = ? WHERE concept_id = ?;`).run(now, input.toConceptId);
    recordAccountabilityConceptEvent(db, { conceptId: input.fromConceptId, eventType: "merge", payload: { into: input.toConceptId, movedAssignments } }, now);
    recordAccountabilityConceptEvent(db, { conceptId: input.toConceptId, eventType: "merge_receive", payload: { from: input.fromConceptId, movedAssignments } }, now);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return { movedAssignments, from: getAccountabilityConcept(db, input.fromConceptId)!, to: getAccountabilityConcept(db, input.toConceptId)! };
}

export function loadAccountabilityConceptMetadataForAssertions(
  db: DatabaseSync,
  assertions?: Array<{ kind: "action" | "decision"; assertionId: string | null | undefined }>,
): Map<string, AccountabilityConceptMetadata> {
  ensureAccountabilityConceptSchema(db);
  const requested = assertions?.filter((assertion) => assertion.assertionId).map((assertion) => `${assertion.kind}:${assertion.assertionId}`) ?? [];
  const requestedSet = new Set(requested);
  const rows = db
    .prepare(
      `SELECT a.assertion_kind as assertionKind,
              a.assertion_id as assertionId,
              a.source as assignmentSource,
              a.confidence as confidence,
              COALESCE(survivor.concept_id, c.concept_id) as conceptId,
              COALESCE(survivor.label, c.label) as label,
              COALESCE(survivor.summary, c.summary) as summary,
              COALESCE(survivor.status, c.status) as status
       FROM accountability_concept_assignments a
       JOIN accountability_concepts c ON c.concept_id = a.concept_id
       LEFT JOIN accountability_concepts survivor ON c.status = 'merged' AND survivor.concept_id = c.merged_into_concept_id
       ORDER BY a.assertion_kind, a.assertion_id;`,
    )
    .all() as Array<{
      assertionKind: "action" | "decision";
      assertionId: string;
      assignmentSource: string | null;
      confidence: number | null;
      conceptId: string;
      label: string;
      summary: string | null;
      status: string | null;
    }>;
  const metadata = new Map<string, AccountabilityConceptMetadata>();
  for (const row of rows) {
    const key = `${row.assertionKind}:${row.assertionId}`;
    if (requestedSet.size > 0 && !requestedSet.has(key)) {
      continue;
    }
    metadata.set(key, {
      id: row.conceptId,
      label: row.label,
      summary: row.summary ?? "",
      status: normalizeConceptStatus(row.status),
      assignmentSource: normalizeConceptAssignmentSource(row.assignmentSource),
      confidence: row.confidence == null ? null : Number(row.confidence),
    });
  }
  return metadata;
}

export function splitAccountabilityConcept(
  db: DatabaseSync,
  input: { sourceConceptId: string; concepts: Array<{ label: string; summary?: string | null; assertionIds?: string[] }> },
  now = new Date().toISOString(),
): { created: AccountabilityConcept[]; reassigned: number } {
  ensureAccountabilityConceptSchema(db);
  if (!getAccountabilityConcept(db, input.sourceConceptId)) {
    throw new Error("Source concept not found");
  }
  if (!input.concepts.length) {
    throw new Error("Split requires at least one new concept");
  }
  const created: AccountabilityConcept[] = [];
  let reassigned = 0;
  db.exec("BEGIN;");
  try {
    for (const candidate of input.concepts) {
      const concept = createAccountabilityConcept(db, { label: candidate.label, summary: candidate.summary ?? "" }, now);
      created.push(concept);
      for (const assertionId of candidate.assertionIds ?? []) {
        const row = db
          .prepare(`SELECT assertion_kind as assertionKind FROM accountability_concept_assignments WHERE concept_id = ? AND assertion_id = ? LIMIT 1;`)
          .get(input.sourceConceptId, assertionId) as { assertionKind?: "action" | "decision" } | undefined;
        if (!row?.assertionKind) {
          continue;
        }
        assignAssertionConcept(db, { conceptId: concept.conceptId, assertionKind: row.assertionKind, assertionId, source: "manual", confidence: null }, now);
        reassigned += 1;
      }
    }
    if (reassigned === 0) {
      throw new Error("Split requires at least one existing source assignment to move");
    }
    recordAccountabilityConceptEvent(db, { conceptId: input.sourceConceptId, eventType: "split", payload: { createdConceptIds: created.map((concept) => concept.conceptId), reassigned } }, now);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return { created, reassigned };
}

export function ensureSemanticConceptProposalSchema(db: DatabaseSync): void {
  ensureAccountabilityConceptSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_concept_proposal_runs (
      proposal_run_id TEXT PRIMARY KEY,
      source_window_json TEXT NOT NULL,
      index_version TEXT NOT NULL,
      registry_snapshot_version TEXT NOT NULL,
      prompt_version_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      diagnostics_json TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS semantic_concept_proposals (
      proposal_id TEXT PRIMARY KEY,
      proposal_run_id TEXT NOT NULL,
      canonical_label_suggestion TEXT NOT NULL,
      definition TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      scope TEXT NOT NULL,
      confidence REAL NOT NULL,
      registry_action TEXT NOT NULL,
      existing_concept_id TEXT,
      aliases_suggested_json TEXT NOT NULL,
      linked_action_ids_json TEXT NOT NULL,
      linked_decision_ids_json TEXT NOT NULL,
      linked_evidence_window_ids_json TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      target_concept_id TEXT,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS semantic_concept_proposal_reviews (
      review_id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      target_concept_id TEXT,
      reviewer TEXT,
      reasons_json TEXT NOT NULL,
      aliases_accepted_json TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS semantic_concept_suppressions (
      suppression_id TEXT PRIMARY KEY,
      normalized_label TEXT NOT NULL UNIQUE,
      proposal_id TEXT,
      reason TEXT,
      reviewer TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_concept_proposals_run ON semantic_concept_proposals (proposal_run_id, review_status, confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_concept_proposal_reviews_proposal ON semantic_concept_proposal_reviews (proposal_id, reviewed_at);
    CREATE INDEX IF NOT EXISTS idx_semantic_concept_suppressions_label ON semantic_concept_suppressions (normalized_label);
  `);
}

export function ensureSemanticRefreshRunSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_refresh_runs (
      semantic_refresh_run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      source TEXT,
      source_document_id TEXT,
      document_version_id TEXT,
      ingestion_run_id TEXT,
      index_version_id TEXT,
      proposal_run_id TEXT,
      proposals_imported INTEGER NOT NULL DEFAULT 0,
      auto_applied INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_status ON semantic_refresh_runs (status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_ingestion ON semantic_refresh_runs (ingestion_run_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_source_document ON semantic_refresh_runs (source_document_id, started_at DESC);
  `);
}

function normalizeSemanticRefreshRunStatus(value: string | null | undefined): SemanticRefreshRunStatus {
  return value === "completed" || value === "failed" ? value : "running";
}

function semanticRefreshRunRow(row: {
  semanticRefreshRunId: string;
  status: string;
  trigger: string;
  source: string | null;
  sourceDocumentId: string | null;
  documentVersionId: string | null;
  ingestionRunId: string | null;
  indexVersionId: string | null;
  proposalRunId: string | null;
  proposalsImported: number | null;
  autoApplied: number | null;
  pending: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}): SemanticRefreshRunRecord {
  return {
    ...row,
    status: normalizeSemanticRefreshRunStatus(row.status),
    proposalsImported: Number(row.proposalsImported ?? 0),
    autoApplied: Number(row.autoApplied ?? 0),
    pending: Number(row.pending ?? 0),
  };
}

export function startSemanticRefreshRun(
  db: DatabaseSync,
  input: { trigger: string; source?: string | null; sourceDocumentId?: string | null; documentVersionId?: string | null; ingestionRunId?: string | null; semanticRefreshRunId?: string | null },
  now = new Date().toISOString(),
): SemanticRefreshRunRecord {
  ensureSemanticRefreshRunSchema(db);
  const semanticRefreshRunId = input.semanticRefreshRunId?.trim() || `semantic_refresh_run_${randomUUID()}`;
  db.prepare(`
    INSERT INTO semantic_refresh_runs (
      semantic_refresh_run_id, status, trigger, source, source_document_id, document_version_id,
      ingestion_run_id, index_version_id, proposal_run_id, proposals_imported, auto_applied,
      pending, error, started_at, finished_at
    ) VALUES (?, 'running', ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 0, NULL, ?, NULL);
  `).run(
    semanticRefreshRunId,
    input.trigger || "unknown",
    input.source ?? null,
    input.sourceDocumentId ?? null,
    input.documentVersionId ?? null,
    input.ingestionRunId ?? null,
    now,
  );
  return getSemanticRefreshRun(db, semanticRefreshRunId)!;
}

export function finishSemanticRefreshRun(
  db: DatabaseSync,
  input: {
    semanticRefreshRunId: string;
    status: Exclude<SemanticRefreshRunStatus, "running">;
    indexVersionId?: string | null;
    proposalRunId?: string | null;
    proposalsImported?: number | null;
    autoApplied?: number | null;
    pending?: number | null;
    error?: string | null;
  },
  now = new Date().toISOString(),
): SemanticRefreshRunRecord {
  ensureSemanticRefreshRunSchema(db);
  db.prepare(`
    UPDATE semantic_refresh_runs
    SET status = ?,
        index_version_id = COALESCE(?, index_version_id),
        proposal_run_id = COALESCE(?, proposal_run_id),
        proposals_imported = COALESCE(?, proposals_imported),
        auto_applied = COALESCE(?, auto_applied),
        pending = COALESCE(?, pending),
        error = ?,
        finished_at = ?
    WHERE semantic_refresh_run_id = ?;
  `).run(
    input.status,
    input.indexVersionId ?? null,
    input.proposalRunId ?? null,
    input.proposalsImported ?? null,
    input.autoApplied ?? null,
    input.pending ?? null,
    input.error ?? null,
    now,
    input.semanticRefreshRunId,
  );
  const run = getSemanticRefreshRun(db, input.semanticRefreshRunId);
  if (!run) throw new Error("Semantic refresh run not found");
  return run;
}

export function getSemanticRefreshRun(db: DatabaseSync, semanticRefreshRunId: string): SemanticRefreshRunRecord | null {
  ensureSemanticRefreshRunSchema(db);
  const row = db.prepare(`
    SELECT semantic_refresh_run_id as semanticRefreshRunId,
           status,
           trigger,
           source,
           source_document_id as sourceDocumentId,
           document_version_id as documentVersionId,
           ingestion_run_id as ingestionRunId,
           index_version_id as indexVersionId,
           proposal_run_id as proposalRunId,
           proposals_imported as proposalsImported,
           auto_applied as autoApplied,
           pending,
           error,
           started_at as startedAt,
           finished_at as finishedAt
    FROM semantic_refresh_runs
    WHERE semantic_refresh_run_id = ?
    LIMIT 1;
  `).get(semanticRefreshRunId) as Parameters<typeof semanticRefreshRunRow>[0] | undefined;
  return row ? semanticRefreshRunRow(row) : null;
}

export function listSemanticRefreshRuns(db: DatabaseSync, limit = 50): SemanticRefreshRunRecord[] {
  ensureSemanticRefreshRunSchema(db);
  const rows = db.prepare(`
    SELECT semantic_refresh_run_id as semanticRefreshRunId,
           status,
           trigger,
           source,
           source_document_id as sourceDocumentId,
           document_version_id as documentVersionId,
           ingestion_run_id as ingestionRunId,
           index_version_id as indexVersionId,
           proposal_run_id as proposalRunId,
           proposals_imported as proposalsImported,
           auto_applied as autoApplied,
           pending,
           error,
           started_at as startedAt,
           finished_at as finishedAt
    FROM semantic_refresh_runs
    ORDER BY started_at DESC
    LIMIT ?;
  `).all(Math.max(1, Math.min(500, Math.floor(limit)))) as Array<Parameters<typeof semanticRefreshRunRow>[0]>;
  return rows.map(semanticRefreshRunRow);
}

export function updateMeetingIngestionSemanticResult(
  db: DatabaseSync,
  ingestionRunId: string | null | undefined,
  input: MeetingIngestionSemanticResultInput,
): { updated: number } {
  if (!ingestionRunId) return { updated: 0 };
  ensureSemanticRefreshRunSchema(db);
  const result = db.prepare(`
    UPDATE meeting_ingestion_runs
    SET semantic_status = ?,
        semantic_message = ?,
        semantic_proposal_run_id = ?,
        semantic_auto_applied_count = ?,
        semantic_finished_at = ?
    WHERE ingestion_run_id = ?;
  `).run(
    input.status,
    input.message ?? null,
    input.proposalRunId ?? null,
    input.autoAppliedCount ?? null,
    input.finishedAt ?? new Date().toISOString(),
    ingestionRunId,
  );
  return { updated: Number(result.changes ?? 0) };
}

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeSemanticProposalLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

function semanticProposalSuppressionExists(db: DatabaseSync, label: string) {
  const normalizedLabel = normalizeSemanticProposalLabel(label);
  if (!normalizedLabel) return false;
  return Boolean(
    db.prepare(`SELECT 1 FROM semantic_concept_suppressions WHERE normalized_label = ? LIMIT 1;`).get(normalizedLabel),
  );
}

type SemanticConceptProposalStoredRecord = Omit<SemanticConceptProposalRecord, "applyReady" | "missingTargets">;

function semanticProposalRow(row: {
  proposalId: string;
  proposalRunId: string;
  canonicalLabelSuggestion: string;
  definition: string;
  whyItMatters: string;
  scope: string;
  confidence: number;
  registryAction: string;
  existingConceptId: string | null;
  aliasesSuggestedJson: string;
  linkedActionIdsJson: string;
  linkedDecisionIdsJson: string;
  linkedEvidenceWindowIdsJson: string;
  reviewStatus: string;
  targetConceptId: string | null;
  rawJson: string;
  importedAt: string;
  reviewedAt: string | null;
}): SemanticConceptProposalStoredRecord {
  return {
    proposalId: row.proposalId,
    proposalRunId: row.proposalRunId,
    canonicalLabelSuggestion: row.canonicalLabelSuggestion,
    definition: row.definition,
    whyItMatters: row.whyItMatters,
    scope: row.scope,
    confidence: Number(row.confidence),
    registryAction: row.registryAction,
    existingConceptId: row.existingConceptId ?? null,
    aliasesSuggested: parseJsonArray(row.aliasesSuggestedJson),
    linkedActionIds: parseJsonArray(row.linkedActionIdsJson),
    linkedDecisionIds: parseJsonArray(row.linkedDecisionIdsJson),
    linkedEvidenceWindowIds: parseJsonArray(row.linkedEvidenceWindowIdsJson),
    reviewStatus: row.reviewStatus === "accepted" || row.reviewStatus === "rejected" || row.reviewStatus === "suppressed" || row.reviewStatus === "merged" || row.reviewStatus === "alias_added" ? row.reviewStatus : "pending",
    targetConceptId: row.targetConceptId ?? null,
    rawJson: row.rawJson,
    importedAt: row.importedAt,
    reviewedAt: row.reviewedAt ?? null,
  };
}

function loadSemanticProposal(db: DatabaseSync, proposalId: string): SemanticConceptProposalRecord | null {
  ensureSemanticConceptProposalSchema(db);
  const row = db.prepare(`
    SELECT proposal_id as proposalId,
           proposal_run_id as proposalRunId,
           canonical_label_suggestion as canonicalLabelSuggestion,
           definition,
           why_it_matters as whyItMatters,
           scope,
           confidence,
           registry_action as registryAction,
           existing_concept_id as existingConceptId,
           aliases_suggested_json as aliasesSuggestedJson,
           linked_action_ids_json as linkedActionIdsJson,
           linked_decision_ids_json as linkedDecisionIdsJson,
           linked_evidence_window_ids_json as linkedEvidenceWindowIdsJson,
           review_status as reviewStatus,
           target_concept_id as targetConceptId,
           raw_json as rawJson,
           imported_at as importedAt,
           reviewed_at as reviewedAt
    FROM semantic_concept_proposals
    WHERE proposal_id = ?
    LIMIT 1;
  `).get(proposalId) as Parameters<typeof semanticProposalRow>[0] | undefined;
  return row ? withSemanticProposalTargetResolution(db, semanticProposalRow(row)) : null;
}

function normalizeSemanticAssertionMatchText(text: string | null | undefined) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[`*_~[\]().,!?:;'"/\\]+/gu, " ")
    .replace(/\b(the|a|an|to|and|or|of|for|with|on|in|at|by|now)\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function semanticAssertionTable(kind: "action" | "decision") {
  return kind === "action"
    ? { table: "action_assertions", idColumn: "action_assertion_id", ownerColumn: "raw_assignee" }
    : { table: "decision_assertions", idColumn: "decision_assertion_id", ownerColumn: "raw_owner" };
}

function semanticAssertionExists(db: DatabaseSync, kind: "action" | "decision", assertionId: string) {
  const table = semanticAssertionTable(kind);
  return Boolean(db.prepare(`SELECT 1 FROM ${table.table} WHERE ${table.idColumn} = ? LIMIT 1;`).get(assertionId));
}

function semanticSourceDocumentVersionIds(db: DatabaseSync, sourceRef: SemanticAssertionCandidateResolutionInput["sourceRef"]): string[] {
  if (!sourceRef) return [];
  const versionIds = new Set<string>();
  const canonicalSourcePath = sourceRef.canonicalSourcePath?.trim();
  if (canonicalSourcePath) {
    const rows = db.prepare(`
      SELECT dv.document_version_id as documentVersionId
      FROM source_documents sd
      JOIN document_versions dv ON dv.source_document_id = sd.source_document_id
      WHERE sd.canonical_source_path = ? OR sd.absolute_path = ?
      ORDER BY dv.captured_at DESC;
    `).all(canonicalSourcePath, canonicalSourcePath) as Array<{ documentVersionId?: string }>;
    for (const row of rows) if (row.documentVersionId) versionIds.add(row.documentVersionId);
  }
  const contentHash = sourceRef.contentHash?.trim();
  if (contentHash) {
    const rows = db.prepare(`SELECT document_version_id as documentVersionId FROM document_versions WHERE content_hash = ? ORDER BY captured_at DESC;`).all(contentHash) as Array<{ documentVersionId?: string }>;
    for (const row of rows) if (row.documentVersionId) versionIds.add(row.documentVersionId);
  }
  const recordingId = sourceRef.recordingId?.trim();
  if (recordingId) {
    const rows = db.prepare(`
      SELECT current_document_version_id as documentVersionId
      FROM meetings
      WHERE recording_id = ?
      ORDER BY last_ingested_at DESC;
    `).all(recordingId) as Array<{ documentVersionId?: string }>;
    for (const row of rows) if (row.documentVersionId) versionIds.add(row.documentVersionId);
  }
  return [...versionIds];
}

function resolveSemanticCandidateByText(
  db: DatabaseSync,
  input: SemanticAssertionCandidateResolutionInput & { kind: "action" | "decision" },
  documentVersionIds: string[],
): Omit<SemanticAssertionCandidateResolution, "candidateId" | "kind"> {
  const normalized = normalizeSemanticAssertionMatchText(input.normalizedText || input.text);
  if (!normalized) return { assertionId: null, method: "unresolved", ambiguous: false };
  const table = semanticAssertionTable(input.kind);
  const rows = documentVersionIds.length > 0
    ? db.prepare(`
        SELECT ${table.idColumn} as assertionId, summary, label, raw_json as rawJson
        FROM ${table.table}
        WHERE document_version_id IN (${documentVersionIds.map(() => "?").join(",")})
        ORDER BY sequence ASC;
      `).all(...documentVersionIds) as Array<{ assertionId?: string; summary?: string | null; label?: string | null; rawJson?: string | null }>
    : [];
  const sourceMatches = rows.filter((row) =>
    normalizeSemanticAssertionMatchText(row.summary) === normalized ||
    normalizeSemanticAssertionMatchText(row.label) === normalized ||
    normalizeSemanticAssertionMatchText(row.rawJson) === normalized
  );
  if (sourceMatches.length === 1 && sourceMatches[0].assertionId) return { assertionId: sourceMatches[0].assertionId, method: "source_text", ambiguous: false };
  if (sourceMatches.length > 1) return { assertionId: null, method: "unresolved", ambiguous: true };

  const globalRows = db.prepare(`
    SELECT ${table.idColumn} as assertionId, summary, label
    FROM ${table.table}
    ORDER BY meeting_id ASC, sequence ASC;
  `).all() as Array<{ assertionId?: string; summary?: string | null; label?: string | null }>;
  const globalMatches = globalRows.filter((row) =>
    normalizeSemanticAssertionMatchText(row.summary) === normalized ||
    normalizeSemanticAssertionMatchText(row.label) === normalized
  );
  if (globalMatches.length === 1 && globalMatches[0].assertionId) return { assertionId: globalMatches[0].assertionId, method: "global_text", ambiguous: false };
  return { assertionId: null, method: "unresolved", ambiguous: globalMatches.length > 1 };
}

export function resolveSemanticAssertionCandidateTargets(
  db: DatabaseSync,
  candidates: SemanticAssertionCandidateResolutionInput[],
): SemanticAssertionCandidateResolution[] {
  return candidates
    .map((candidate) => {
      const kind = candidate.kind === "decision" ? "decision" : candidate.kind === "action" ? "action" : null;
      if (!kind) return null;
      const candidateId = candidate.candidateId.trim();
      if (!candidateId) return null;
      const missionControlId = candidate.sourceRef?.missionControlId?.trim();
      if (missionControlId && semanticAssertionExists(db, kind, missionControlId)) {
        return { candidateId, kind, assertionId: missionControlId, method: "mission_control_id", ambiguous: false } satisfies SemanticAssertionCandidateResolution;
      }
      if (semanticAssertionExists(db, kind, candidateId)) {
        return { candidateId, kind, assertionId: candidateId, method: "already_mc_id", ambiguous: false } satisfies SemanticAssertionCandidateResolution;
      }
      const textMatch = resolveSemanticCandidateByText(db, { ...candidate, kind }, semanticSourceDocumentVersionIds(db, candidate.sourceRef));
      return { candidateId, kind, ...textMatch } satisfies SemanticAssertionCandidateResolution;
    })
    .filter((resolution): resolution is SemanticAssertionCandidateResolution => Boolean(resolution));
}

export function resolveSemanticConceptProposalRunAssertionTargets(
  db: DatabaseSync,
  run: Record<string, unknown>,
  candidates: SemanticAssertionCandidateResolutionInput[],
): SemanticProposalRunResolutionResult {
  const resolutions = resolveSemanticAssertionCandidateTargets(db, candidates);
  const actionMap = new Map(resolutions.filter((resolution) => resolution.kind === "action" && resolution.assertionId).map((resolution) => [resolution.candidateId, resolution.assertionId as string]));
  const decisionMap = new Map(resolutions.filter((resolution) => resolution.kind === "decision" && resolution.assertionId).map((resolution) => [resolution.candidateId, resolution.assertionId as string]));
  const unresolved = resolutions.filter((resolution) => !resolution.assertionId).map((resolution) => `${resolution.kind}:${resolution.candidateId}`);
  const proposals = Array.isArray(run.proposals) ? run.proposals as Array<Record<string, unknown>> : [];
  const resolvedProposals = proposals.map((proposal) => {
    const linkedActionIds = (Array.isArray(proposal.linkedActionIds) ? proposal.linkedActionIds.map(String) : []).map((id) => actionMap.get(id) ?? id);
    const linkedDecisionIds = (Array.isArray(proposal.linkedDecisionIds) ? proposal.linkedDecisionIds.map(String) : []).map((id) => decisionMap.get(id) ?? id);
    const proposalUnresolved = [
      ...linkedActionIds.filter((id) => !semanticAssertionExists(db, "action", id)).map((id) => `action:${id}`),
      ...linkedDecisionIds.filter((id) => !semanticAssertionExists(db, "decision", id)).map((id) => `decision:${id}`),
    ];
    return {
      ...proposal,
      linkedActionIds: [...new Set(linkedActionIds)],
      linkedDecisionIds: [...new Set(linkedDecisionIds)],
      missionControlResolution: {
        applyReady: proposalUnresolved.length === 0,
        missingTargets: proposalUnresolved,
      },
    };
  });
  return { proposalRun: { ...run, proposals: resolvedProposals }, resolutions, unresolved };
}

function parseSemanticProposalImportConfidence(value: unknown): { ok: true; value: number; diagnostics: string[] } | { ok: false; diagnostics: string[] } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, diagnostics: ["confidence missing or non-finite"] };
  if (value <= 0) return { ok: false, diagnostics: ["confidence must be > 0"] };
  if (value > 1 && value <= 100) return { ok: true, value: value / 100, diagnostics: ["confidence normalized from percent"] };
  if (value > 1) return { ok: false, diagnostics: ["confidence must be <= 1 or a percent <= 100"] };
  return { ok: true, value, diagnostics: [] };
}

export function importSemanticConceptProposalRun(db: DatabaseSync, run: Record<string, unknown>, now = new Date().toISOString()): SemanticProposalImportResult {
  ensureSemanticConceptProposalSchema(db);
  const proposalRunId = String(run.proposalRunId || "").trim();
  const proposals = Array.isArray(run.proposals) ? run.proposals as Array<Record<string, unknown>> : [];
  if (!proposalRunId) throw new Error("Semantic proposal run requires proposalRunId");
  const diagnostics: string[] = [];
  let proposalsSkipped = 0;
  const importableProposals: Array<{ proposal: Record<string, unknown>; confidence: number }> = [];
  for (const proposal of proposals) {
    const proposalId = String(proposal.proposalId || "").trim();
    if (!proposalId) {
      diagnostics.push("skipped semantic proposal with missing proposalId");
      proposalsSkipped += 1;
      continue;
    }
    const confidence = parseSemanticProposalImportConfidence(proposal.confidence);
    if (!confidence.ok) {
      diagnostics.push(`skipped semantic proposal ${proposalId}: ${confidence.diagnostics.join(", ")}`);
      proposalsSkipped += 1;
      continue;
    }
    diagnostics.push(...confidence.diagnostics.map((diagnostic) => `semantic proposal ${proposalId}: ${diagnostic}`));
    importableProposals.push({ proposal, confidence: confidence.value });
  }
  const runDiagnostics = [...(Array.isArray(run.diagnostics) ? run.diagnostics.map(String) : []), ...diagnostics];
  const runForStorage = diagnostics.length > 0
    ? { ...run, diagnostics: runDiagnostics, importDiagnostics: { proposalsSkipped, diagnostics } }
    : run;
  db.exec("BEGIN;");
  try {
    db.prepare(`
      INSERT INTO semantic_concept_proposal_runs (
        proposal_run_id, source_window_json, index_version, registry_snapshot_version, prompt_version_json, generated_at, imported_at, diagnostics_json, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(proposal_run_id) DO UPDATE SET
        source_window_json = excluded.source_window_json,
        index_version = excluded.index_version,
        registry_snapshot_version = excluded.registry_snapshot_version,
        prompt_version_json = excluded.prompt_version_json,
        generated_at = excluded.generated_at,
        imported_at = excluded.imported_at,
        diagnostics_json = excluded.diagnostics_json,
        raw_json = excluded.raw_json;
    `).run(
      proposalRunId,
      JSON.stringify(run.sourceWindow ?? {}),
      String(run.indexVersion ?? "unknown"),
      String(run.registrySnapshotVersion ?? "unknown"),
      JSON.stringify(run.promptVersion ?? {}),
      String(run.generatedAt ?? now),
      now,
      JSON.stringify(runDiagnostics),
      JSON.stringify(runForStorage),
    );
    const insertProposal = db.prepare(`
      INSERT INTO semantic_concept_proposals (
        proposal_id, proposal_run_id, canonical_label_suggestion, definition, why_it_matters, scope, confidence,
        registry_action, existing_concept_id, aliases_suggested_json, linked_action_ids_json,
        linked_decision_ids_json, linked_evidence_window_ids_json, review_status, target_concept_id, raw_json, imported_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT review_status FROM semantic_concept_proposals WHERE proposal_id = ?), ?), COALESCE((SELECT target_concept_id FROM semantic_concept_proposals WHERE proposal_id = ?), NULL), ?, ?, COALESCE((SELECT reviewed_at FROM semantic_concept_proposals WHERE proposal_id = ?), NULL))
      ON CONFLICT(proposal_id) DO UPDATE SET
        proposal_run_id = excluded.proposal_run_id,
        canonical_label_suggestion = excluded.canonical_label_suggestion,
        definition = excluded.definition,
        why_it_matters = excluded.why_it_matters,
        scope = excluded.scope,
        confidence = excluded.confidence,
        registry_action = excluded.registry_action,
        existing_concept_id = excluded.existing_concept_id,
        aliases_suggested_json = excluded.aliases_suggested_json,
        linked_action_ids_json = excluded.linked_action_ids_json,
        linked_decision_ids_json = excluded.linked_decision_ids_json,
        linked_evidence_window_ids_json = excluded.linked_evidence_window_ids_json,
        raw_json = excluded.raw_json,
        imported_at = excluded.imported_at;
    `);
    for (const { proposal, confidence } of importableProposals) {
      const proposalId = String(proposal.proposalId || "").trim();
      const label = String(proposal.canonicalLabelSuggestion ?? "");
      const defaultReviewStatus = semanticProposalSuppressionExists(db, label) ? "suppressed" : "pending";
      insertProposal.run(
        proposalId,
        proposalRunId,
        label,
        String(proposal.definition ?? ""),
        String(proposal.whyItMatters ?? ""),
        String(proposal.scope ?? ""),
        confidence,
        String(proposal.registryAction ?? "propose_new"),
        typeof proposal.existingConceptId === "string" ? proposal.existingConceptId : null,
        JSON.stringify(Array.isArray(proposal.aliasesSuggested) ? proposal.aliasesSuggested : []),
        JSON.stringify(Array.isArray(proposal.linkedActionIds) ? proposal.linkedActionIds : []),
        JSON.stringify(Array.isArray(proposal.linkedDecisionIds) ? proposal.linkedDecisionIds : []),
        JSON.stringify(Array.isArray(proposal.linkedEvidenceWindowIds) ? proposal.linkedEvidenceWindowIds : []),
        proposalId,
        defaultReviewStatus,
        proposalId,
        JSON.stringify(proposal),
        now,
        proposalId,
      );
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return { proposalRunId, proposalsImported: importableProposals.length, evidencePacketsImported: Array.isArray(run.evidencePackets) ? run.evidencePackets.length : 0, proposalsSkipped, diagnostics };
}

type SemanticConceptProposalListOptions = { reviewStatus?: "pending" | "all" };

export function listSemanticConceptProposalRuns(db: DatabaseSync, options: SemanticConceptProposalListOptions = {}): SemanticConceptProposalRunRecord[] {
  ensureSemanticConceptProposalSchema(db);
  const rows = db.prepare(`
    SELECT proposal_run_id as proposalRunId,
           source_window_json as sourceWindowJson,
           index_version as indexVersion,
           registry_snapshot_version as registrySnapshotVersion,
           prompt_version_json as promptVersionJson,
           generated_at as generatedAt,
           imported_at as importedAt,
           diagnostics_json as diagnosticsJson,
           raw_json as rawJson
    FROM semantic_concept_proposal_runs
    ORDER BY generated_at DESC, imported_at DESC;
  `).all() as Array<Omit<SemanticConceptProposalRunRecord, "proposals">>;
  return rows.map((row) => ({ ...row, proposals: listSemanticConceptProposals(db, row.proposalRunId, options) }));
}

export function listSemanticConceptProposals(db: DatabaseSync, proposalRunId?: string, options: SemanticConceptProposalListOptions = {}): SemanticConceptProposalRecord[] {
  ensureSemanticConceptProposalSchema(db);
  const where: string[] = [];
  const params: string[] = [];
  if (proposalRunId) {
    where.push("proposal_run_id = ?");
    params.push(proposalRunId);
  }
  if (options.reviewStatus === "pending") {
    where.push("review_status = ?");
    params.push("pending");
  }
  const sql = `
    SELECT proposal_id as proposalId,
           proposal_run_id as proposalRunId,
           canonical_label_suggestion as canonicalLabelSuggestion,
           definition,
           why_it_matters as whyItMatters,
           scope,
           confidence,
           registry_action as registryAction,
           existing_concept_id as existingConceptId,
           aliases_suggested_json as aliasesSuggestedJson,
           linked_action_ids_json as linkedActionIdsJson,
           linked_decision_ids_json as linkedDecisionIdsJson,
           linked_evidence_window_ids_json as linkedEvidenceWindowIdsJson,
           review_status as reviewStatus,
           target_concept_id as targetConceptId,
           raw_json as rawJson,
           imported_at as importedAt,
           reviewed_at as reviewedAt
    FROM semantic_concept_proposals
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY confidence DESC, canonical_label_suggestion;
  `;
  const rows = db.prepare(sql).all(...params) as Array<Parameters<typeof semanticProposalRow>[0]>;
  return rows.map((row) => withSemanticProposalTargetResolution(db, semanticProposalRow(row)));
}

export function getSemanticConceptProposalRun(db: DatabaseSync, proposalRunId: string): SemanticConceptProposalRunRecord | null {
  ensureSemanticConceptProposalSchema(db);
  const row = db.prepare(`
    SELECT proposal_run_id as proposalRunId,
           source_window_json as sourceWindowJson,
           index_version as indexVersion,
           registry_snapshot_version as registrySnapshotVersion,
           prompt_version_json as promptVersionJson,
           generated_at as generatedAt,
           imported_at as importedAt,
           diagnostics_json as diagnosticsJson,
           raw_json as rawJson
    FROM semantic_concept_proposal_runs
    WHERE proposal_run_id = ?
    LIMIT 1;
  `).get(proposalRunId) as Omit<SemanticConceptProposalRunRecord, "proposals"> | undefined;
  return row ? { ...row, proposals: listSemanticConceptProposals(db, proposalRunId) } : null;
}

function missingSemanticProposalAssertionTargets(db: DatabaseSync, proposal: SemanticConceptProposalRecord): string[] {
  const missing: string[] = [];
  const actionExists = db.prepare(`SELECT 1 FROM action_assertions WHERE action_assertion_id = ? LIMIT 1;`);
  const decisionExists = db.prepare(`SELECT 1 FROM decision_assertions WHERE decision_assertion_id = ? LIMIT 1;`);
  for (const actionId of proposal.linkedActionIds) {
    if (!actionExists.get(actionId)) missing.push(`action:${actionId}`);
  }
  for (const decisionId of proposal.linkedDecisionIds) {
    if (!decisionExists.get(decisionId)) missing.push(`decision:${decisionId}`);
  }
  return missing;
}

export function semanticConceptProposalTargetResolution(db: DatabaseSync, proposal: SemanticConceptProposalRecord): SemanticProposalTargetResolution {
  const missingTargets = missingSemanticProposalAssertionTargets(db, proposal);
  return { proposalId: proposal.proposalId, applyReady: missingTargets.length === 0, missingTargets };
}

function withSemanticProposalTargetResolution(db: DatabaseSync, proposal: SemanticConceptProposalStoredRecord): SemanticConceptProposalRecord {
  const targetResolution = semanticConceptProposalTargetResolution(db, proposal as SemanticConceptProposalRecord);
  return { ...proposal, applyReady: targetResolution.applyReady, missingTargets: targetResolution.missingTargets };
}

export function reviewSemanticConceptProposal(
  db: DatabaseSync,
  input: { proposalId: string; decision: "accept" | "reject" | "merge" | "add_alias"; targetConceptId?: string | null; reviewer?: string | null; reasons?: string[]; aliasesAccepted?: string[]; assignmentSource?: AccountabilityConceptAssignmentSource },
  now = new Date().toISOString(),
): SemanticProposalApplyResult {
  ensureSemanticConceptProposalSchema(db);
  const proposal = loadSemanticProposal(db, input.proposalId);
  if (!proposal) throw new Error("Semantic proposal not found");
  if (input.decision === "accept") {
    const missingTargets = missingSemanticProposalAssertionTargets(db, proposal);
    if (missingTargets.length > 0) {
      throw new Error(`Semantic proposal linked assertions are not resolvable in Mission Control: ${missingTargets.join(", ")}`);
    }
  }
  let concept: AccountabilityConcept | null = null;
  let assignmentsCreatedOrUpdated = 0;
  const reviewStatus = input.decision === "accept" ? "accepted" : input.decision === "merge" ? "merged" : input.decision === "add_alias" ? "alias_added" : "rejected";
  db.exec("BEGIN;");
  try {
    if (input.decision === "accept") {
      const assignmentSource = input.assignmentSource ?? "manual";
      const semanticEventPayload = { proposalId: proposal.proposalId, proposalRunId: proposal.proposalRunId, reviewer: input.reviewer ?? null };
      const conceptId = proposal.registryAction === "map_existing" || proposal.registryAction === "add_alias" ? proposal.existingConceptId : null;
      concept = conceptId ? getAccountabilityConcept(db, conceptId) : null;
      if (!concept) {
        concept = createAccountabilityConcept(db, { label: proposal.canonicalLabelSuggestion, summary: proposal.definition }, now);
      }
      for (const actionId of proposal.linkedActionIds) {
        assignAssertionConcept(db, { conceptId: concept.conceptId, assertionKind: "action", assertionId: actionId, source: assignmentSource, confidence: proposal.confidence, eventPayload: semanticEventPayload }, now);
        assignmentsCreatedOrUpdated += 1;
      }
      for (const decisionId of proposal.linkedDecisionIds) {
        assignAssertionConcept(db, { conceptId: concept.conceptId, assertionKind: "decision", assertionId: decisionId, source: assignmentSource, confidence: proposal.confidence, eventPayload: semanticEventPayload }, now);
        assignmentsCreatedOrUpdated += 1;
      }
      recordAccountabilityConceptEvent(db, { conceptId: concept.conceptId, eventType: "semantic_proposal_accept", payload: { proposalId: proposal.proposalId, proposalRunId: proposal.proposalRunId, aliasesSuggested: proposal.aliasesSuggested, assignmentSource, reviewer: input.reviewer ?? null } }, now);
    } else if (input.decision === "merge") {
      const targetConceptId = input.targetConceptId?.trim() || proposal.existingConceptId;
      if (!targetConceptId) throw new Error("targetConceptId is required for semantic merge");
      concept = getAccountabilityConcept(db, targetConceptId);
      if (!concept) throw new Error("Target concept not found");
      recordAccountabilityConceptEvent(db, { conceptId: targetConceptId, eventType: "semantic_proposal_merge", payload: { proposalId: proposal.proposalId, proposalRunId: proposal.proposalRunId, label: proposal.canonicalLabelSuggestion } }, now);
    } else if (input.decision === "add_alias") {
      const targetConceptId = input.targetConceptId?.trim() || proposal.existingConceptId;
      if (!targetConceptId) throw new Error("targetConceptId is required for add_alias");
      concept = getAccountabilityConcept(db, targetConceptId);
      if (!concept) throw new Error("Target concept not found");
      recordAccountabilityConceptEvent(db, { conceptId: targetConceptId, eventType: "semantic_proposal_add_alias", payload: { proposalId: proposal.proposalId, aliasesAccepted: input.aliasesAccepted?.length ? input.aliasesAccepted : proposal.aliasesSuggested } }, now);
    }
    db.prepare(`UPDATE semantic_concept_proposals SET review_status = ?, target_concept_id = ?, reviewed_at = ? WHERE proposal_id = ?;`)
      .run(reviewStatus, concept?.conceptId ?? input.targetConceptId ?? null, now, proposal.proposalId);
    db.prepare(`
      INSERT INTO semantic_concept_proposal_reviews (review_id, proposal_id, decision, target_concept_id, reviewer, reasons_json, aliases_accepted_json, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      stableId("semantic_concept_review", proposal.proposalId, input.decision, now),
      proposal.proposalId,
      input.decision,
      concept?.conceptId ?? input.targetConceptId ?? null,
      input.reviewer ?? null,
      JSON.stringify(input.reasons ?? []),
      JSON.stringify(input.aliasesAccepted ?? []),
      now,
    );
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return { proposalId: proposal.proposalId, decision: input.decision, concept, assignmentsCreatedOrUpdated };
}

export function autoApplySafeSemanticConceptProposals(
  db: DatabaseSync,
  options: { proposalRunId?: string | null; minConfidence?: number; reviewer?: string | null } = {},
  now = new Date().toISOString(),
): SemanticAutoApplyResult {
  ensureSemanticConceptProposalSchema(db);
  const minConfidence = options.minConfidence ?? 0.8;
  const proposals = listSemanticConceptProposals(db, options.proposalRunId ?? undefined, { reviewStatus: "pending" });
  let applied = 0;
  let skipped = 0;
  const appliedProposalIds: string[] = [];
  for (const proposal of proposals) {
    const hasTargets = proposal.linkedActionIds.length + proposal.linkedDecisionIds.length > 0;
    if (proposal.confidence < minConfidence || !proposal.applyReady || proposal.missingTargets.length > 0 || !hasTargets) {
      skipped += 1;
      continue;
    }
    reviewSemanticConceptProposal(
      db,
      {
        proposalId: proposal.proposalId,
        decision: "accept",
        reviewer: options.reviewer ?? "semantic_auto",
        reasons: [`auto-applied: confidence ${proposal.confidence} >= ${minConfidence} and all linked assertions resolved`],
        assignmentSource: "semantic_auto",
      },
      now,
    );
    applied += 1;
    appliedProposalIds.push(proposal.proposalId);
  }
  const pending = listSemanticConceptProposals(db, options.proposalRunId ?? undefined, { reviewStatus: "pending" }).length;
  return { considered: proposals.length, applied, pending, skipped, appliedProposalIds };
}

export function suppressSemanticConceptProposal(
  db: DatabaseSync,
  input: { proposalId: string; reason?: string | null; reviewer?: string | null },
  now = new Date().toISOString(),
): SemanticSuppressionResult {
  ensureSemanticConceptProposalSchema(db);
  const proposal = loadSemanticProposal(db, input.proposalId);
  if (!proposal) throw new Error("Semantic proposal not found");
  const normalizedLabel = normalizeSemanticProposalLabel(proposal.canonicalLabelSuggestion);
  if (!normalizedLabel) throw new Error("Semantic proposal label is required for suppression");
  const suppressionId = stableId("semantic_concept_suppression", normalizedLabel);
  db.exec("BEGIN;");
  try {
    db.prepare(`
      INSERT INTO semantic_concept_suppressions (suppression_id, normalized_label, proposal_id, reason, reviewer, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_label) DO UPDATE SET
        proposal_id = excluded.proposal_id,
        reason = excluded.reason,
        reviewer = excluded.reviewer,
        created_at = excluded.created_at;
    `).run(suppressionId, normalizedLabel, proposal.proposalId, input.reason ?? null, input.reviewer ?? null, now);
    db.prepare(`UPDATE semantic_concept_proposals SET review_status = 'suppressed', reviewed_at = ? WHERE proposal_id = ?;`).run(now, proposal.proposalId);
    db.prepare(`
      INSERT INTO semantic_concept_proposal_reviews (review_id, proposal_id, decision, target_concept_id, reviewer, reasons_json, aliases_accepted_json, reviewed_at)
      VALUES (?, ?, 'suppress', NULL, ?, ?, '[]', ?);
    `).run(stableId("semantic_concept_review", proposal.proposalId, "suppress", now), proposal.proposalId, input.reviewer ?? null, JSON.stringify(input.reason ? [input.reason] : []), now);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return { proposalId: proposal.proposalId, suppressionId, suppressed: true };
}

export function listSemanticConceptSuppressions(db: DatabaseSync): SemanticConceptSuppressionRecord[] {
  ensureSemanticConceptProposalSchema(db);
  return db.prepare(`
    SELECT suppression_id as suppressionId,
           normalized_label as normalizedLabel,
           proposal_id as proposalId,
           reason,
           reviewer,
           created_at as createdAt
    FROM semantic_concept_suppressions
    ORDER BY created_at DESC, normalized_label ASC;
  `).all() as SemanticConceptSuppressionRecord[];
}

export function deleteSemanticConceptProposal(db: DatabaseSync, proposalId: string): { proposalId: string; deleted: boolean } {
  ensureSemanticConceptProposalSchema(db);
  db.exec("BEGIN;");
  try {
    db.prepare(`DELETE FROM semantic_concept_proposal_reviews WHERE proposal_id = ?;`).run(proposalId);
    const result = db.prepare(`DELETE FROM semantic_concept_proposals WHERE proposal_id = ?;`).run(proposalId);
    db.exec("COMMIT;");
    return { proposalId, deleted: Number(result.changes ?? 0) > 0 };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function resolveIdentityIdForRawValue(db: DatabaseSync, rawValue: string | null | undefined): string | null {
  return resolveMyntIdentityIdForRawValue(db, rawValue);
}

export function syncMyntIdentitiesToDb(
  db: DatabaseSync,
  identities: MyntIdentitySyncInput[],
  syncedAt = new Date().toISOString(),
): { identities: number; aliases: number } {
  ensureMyntStateSchema(db);
  const upsertIdentity = db.prepare(`
    INSERT INTO identities (identity_id, display_name, primary_email, is_self, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_id) DO UPDATE SET
      display_name = excluded.display_name,
      primary_email = excluded.primary_email,
      is_self = excluded.is_self,
      source = CASE
        WHEN identities.source = 'manual' THEN identities.source
        ELSE excluded.source
      END,
      updated_at = excluded.updated_at;
  `);
  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO identity_aliases (identity_alias_id, identity_id, alias_type, alias_value, created_at)
    VALUES (?, ?, ?, ?, ?);
  `);
  const deleteAliasesForIdentity = db.prepare(`
    DELETE FROM identity_aliases
    WHERE identity_id = ?;
  `);
  let identityCount = 0;
  let aliasCount = 0;

  db.exec("BEGIN;");
  try {
    for (const identity of identities) {
      const identityId = normalizeIdentityValue(identity.id || identity.email || identity.displayName);
      const displayName = normalizeIdentityValue(identity.displayName || identity.email || identity.id);
      if (!identityId || !displayName) {
        continue;
      }
      const email = normalizeIdentityValue(identity.email).toLowerCase();
      upsertIdentity.run(
        identityId,
        displayName,
        email || null,
        identity.isSelf ? 1 : 0,
        normalizeIdentitySource(identity.source),
        syncedAt,
        syncedAt,
      );
      deleteAliasesForIdentity.run(identityId);
      identityCount += 1;

      const aliasValues = uniqueNormalized([displayName, email, ...(identity.aliases ?? [])]);
      for (const aliasValue of aliasValues) {
        const parsed = parseIdentityValue(aliasValue);
        const normalizedAlias = parsed?.email && parsed.raw === parsed.email ? parsed.email : aliasValue;
        const aliasType = parsed?.email && identityLookupKey(normalizedAlias) === parsed.email ? "email" : "name";
        const result = insertAlias.run(
          stableId("identity_alias", identityId, aliasType, normalizedAlias),
          identityId,
          aliasType,
          normalizedAlias,
          syncedAt,
        );
        aliasCount += Number(result.changes ?? 0);
      }
      if (email) {
        const result = insertAlias.run(stableId("identity_alias", identityId, "email", email), identityId, "email", email, syncedAt);
        aliasCount += Number(result.changes ?? 0);
      }
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return { identities: identityCount, aliases: aliasCount };
}

type AssociationCandidate = {
  assertionKind: "action" | "decision";
  assertionId: string;
  meetingId: string;
  documentVersionId: string;
  identityId: string;
  source: AssertionAssociationSource;
};

type AssertionAssociationRow = {
  assertionKind: "action" | "decision";
  assertionId: string;
  meetingId: string;
  documentVersionId: string;
  primaryRaw: string | null;
};

type ParticipantAssociationRow = {
  rawName: string;
  identityId: string | null;
};

function buildAssociationCandidatesForMeetingVersion(
  db: DatabaseSync,
  meetingId: string,
  documentVersionId: string,
): { scannedAssertions: number; candidates: AssociationCandidate[] } {
  const participants = db
    .prepare(
      `SELECT raw_name as rawName, identity_id as identityId
       FROM meeting_participants
       WHERE meeting_id = ? AND document_version_id = ?
       ORDER BY sequence ASC;`,
    )
    .all(meetingId, documentVersionId) as ParticipantAssociationRow[];
  const participantIdentityIds = uniqueNormalized(
    participants.map((participant) => participant.identityId || resolveIdentityIdForRawValue(db, participant.rawName)),
  );
  const assertions = db
    .prepare(
      `SELECT 'action' as assertionKind,
              action_assertion_id as assertionId,
              meeting_id as meetingId,
              document_version_id as documentVersionId,
              raw_assignee as primaryRaw
       FROM action_assertions
       WHERE meeting_id = ? AND document_version_id = ?
       UNION ALL
       SELECT 'decision' as assertionKind,
              decision_assertion_id as assertionId,
              meeting_id as meetingId,
              document_version_id as documentVersionId,
              raw_owner as primaryRaw
       FROM decision_assertions
       WHERE meeting_id = ? AND document_version_id = ?;`,
    )
    .all(meetingId, documentVersionId, meetingId, documentVersionId) as AssertionAssociationRow[];
  const candidates: AssociationCandidate[] = [];

  for (const assertion of assertions) {
    const primaryIdentityId = resolveIdentityIdForRawValue(db, assertion.primaryRaw);
    for (const identityId of participantIdentityIds) {
      if (identityId === primaryIdentityId) {
        continue;
      }
      candidates.push({
        assertionKind: assertion.assertionKind,
        assertionId: assertion.assertionId,
        meetingId: assertion.meetingId,
        documentVersionId: assertion.documentVersionId,
        identityId,
        source: "meeting_participant",
      });
    }
  }

  return { scannedAssertions: assertions.length, candidates };
}

function insertAssociationCandidates(db: DatabaseSync, candidates: AssociationCandidate[], now: string) {
  const insertAssociation = db.prepare(`
    INSERT OR IGNORE INTO assertion_associations (
      assertion_association_id, assertion_kind, assertion_id, meeting_id, document_version_id,
      identity_id, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  let inserted = 0;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.assertionKind}:${candidate.assertionId}:${candidate.identityId}:${candidate.source}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const result = insertAssociation.run(
      stableId("assertion_association", candidate.assertionKind, candidate.assertionId, candidate.identityId, candidate.source),
      candidate.assertionKind,
      candidate.assertionId,
      candidate.meetingId,
      candidate.documentVersionId,
      candidate.identityId,
      candidate.source,
      now,
      now,
    );
    inserted += Number(result.changes ?? 0);
  }
  return inserted;
}

export function deriveAssertionAssociationsForMeetingVersion(
  db: DatabaseSync,
  meetingId: string,
  documentVersionId: string,
  now = new Date().toISOString(),
): AssertionAssociationSyncResult {
  ensureAssertionAssociationSchema(db);
  const { scannedAssertions, candidates } = buildAssociationCandidatesForMeetingVersion(db, meetingId, documentVersionId);
  const deleteResult = db
    .prepare(
      `DELETE FROM assertion_associations
       WHERE meeting_id = ? AND document_version_id = ?;`,
    )
    .run(meetingId, documentVersionId);
  const inserted = insertAssociationCandidates(db, candidates, now);
  return { scannedAssertions, inserted, deleted: Number(deleteResult.changes ?? 0) };
}

export function backfillAssertionAssociations(db: DatabaseSync, now = new Date().toISOString()): AssertionAssociationSyncResult {
  ensureAssertionAssociationSchema(db);
  bootstrapMyntIdentitiesFromCurrentMeetings(db, now);
  const currentMeetings = db
    .prepare(
      `SELECT meeting_id as meetingId, current_document_version_id as documentVersionId
       FROM meetings
       ORDER BY meeting_id;`,
    )
    .all() as Array<{ meetingId?: string; documentVersionId?: string }>;
  let scannedAssertions = 0;
  let inserted = 0;
  let deleted = 0;

  db.exec("BEGIN;");
  try {
    for (const meeting of currentMeetings) {
      if (!meeting.meetingId || !meeting.documentVersionId) {
        continue;
      }
      const result = deriveAssertionAssociationsForMeetingVersion(db, meeting.meetingId, meeting.documentVersionId, now);
      scannedAssertions += result.scannedAssertions;
      inserted += result.inserted;
      deleted += result.deleted;
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return { scannedAssertions, inserted, deleted };
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

    CREATE TABLE IF NOT EXISTS runtime_invocations (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      instruction TEXT NOT NULL,
      context_refs_json TEXT NOT NULL,
      mc_object_type TEXT,
      mc_object_id TEXT,
      obsidian_task_id TEXT,
      details_path TEXT,
      model TEXT,
      thinking TEXT,
      timeout_seconds INTEGER,
      metadata_json TEXT NOT NULL,
      status TEXT NOT NULL,
      session_key TEXT,
      run_id TEXT,
      runtime_task_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      terminal_at TEXT
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
      source TEXT NOT NULL DEFAULT 'legacy',
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

    CREATE TABLE IF NOT EXISTS mynt_archived_items (
      item_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mynt_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS assertion_associations (
      assertion_association_id TEXT PRIMARY KEY,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      document_version_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(assertion_kind, assertion_id, identity_id, source)
    );

    CREATE TABLE IF NOT EXISTS accountability_concepts (
      concept_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      merged_into_concept_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accountability_concept_assignments (
      assignment_id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      assertion_kind TEXT NOT NULL,
      assertion_id TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(assertion_kind, assertion_id)
    );

    CREATE TABLE IF NOT EXISTS accountability_concept_events (
      concept_event_id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
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
      semantic_status TEXT,
      semantic_message TEXT,
      semantic_proposal_run_id TEXT,
      semantic_auto_applied_count INTEGER,
      semantic_finished_at TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS semantic_refresh_runs (
      semantic_refresh_run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      source TEXT,
      source_document_id TEXT,
      document_version_id TEXT,
      ingestion_run_id TEXT,
      index_version_id TEXT,
      proposal_run_id TEXT,
      proposals_imported INTEGER NOT NULL DEFAULT 0,
      auto_applied INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      error TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_assertion ON assertion_associations (assertion_kind, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_meeting_version ON assertion_associations (meeting_id, document_version_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_identity ON assertion_associations (identity_id);
    CREATE INDEX IF NOT EXISTS idx_accountability_concepts_status ON accountability_concepts (status, label);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_assignments_concept ON accountability_concept_assignments (concept_id);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_assignments_assertion ON accountability_concept_assignments (assertion_kind, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_accountability_concept_events_concept ON accountability_concept_events (concept_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_meeting_ingestion_runs_path ON meeting_ingestion_runs (canonical_source_path, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_status ON semantic_refresh_runs (status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_ingestion ON semantic_refresh_runs (ingestion_run_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semantic_refresh_runs_source_document ON semantic_refresh_runs (source_document_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_identity_aliases_value ON identity_aliases (alias_value);
    CREATE INDEX IF NOT EXISTS idx_identity_aliases_identity ON identity_aliases (identity_id);
  `);
  for (const statement of [
    "ALTER TABLE task_flows ADD COLUMN sync_mode TEXT;",
    "ALTER TABLE task_flows ADD COLUMN controller_id TEXT;",
    "ALTER TABLE runtime_tasks ADD COLUMN terminal_outcome TEXT;",
    "ALTER TABLE action_assertions ADD COLUMN task_id TEXT;",
    "ALTER TABLE action_assertions ADD COLUMN details_ref TEXT;",
    "ALTER TABLE decision_assertions ADD COLUMN task_id TEXT;",
    "ALTER TABLE decision_assertions ADD COLUMN details_ref TEXT;",
    "ALTER TABLE identities ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';",
    "ALTER TABLE meeting_ingestion_runs ADD COLUMN semantic_status TEXT;",
    "ALTER TABLE meeting_ingestion_runs ADD COLUMN semantic_message TEXT;",
    "ALTER TABLE meeting_ingestion_runs ADD COLUMN semantic_proposal_run_id TEXT;",
    "ALTER TABLE meeting_ingestion_runs ADD COLUMN semantic_auto_applied_count INTEGER;",
    "ALTER TABLE meeting_ingestion_runs ADD COLUMN semantic_finished_at TEXT;",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Existing deployments may already have the column.
    }
  }
  seedMyntSelfIdentity(db);
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
      bootstrapMyntIdentitiesFromCurrentMeetings(db, input.ingestedAt);
      deriveAssertionAssociationsForMeetingVersion(db, meetingId, existingVersion.documentVersionId, input.ingestedAt);
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
      ingestionRunId,
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

  const ingestionRunId = stableId("ingestion_run", sourceDocumentId, input.contentHash, startedAt, "ingested");

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

    bootstrapMyntIdentitiesFromCurrentMeetings(db, input.ingestedAt);
    deriveAssertionAssociationsForMeetingVersion(db, meetingId, documentVersionId, input.ingestedAt);

    insertIngestionRun.run(
      ingestionRunId,
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
    ingestionRunId,
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
  ensureAccountabilityConceptSchema(db);
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
  const deleteAssociations = db.prepare(`
    DELETE FROM assertion_associations
    WHERE assertion_kind = ? AND assertion_id = ?;
  `);
  const deleteConceptAssignment = db.prepare(`
    DELETE FROM accountability_concept_assignments
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
      deleteAssociations.run(item.kind, item.assertionId);
      deleteConceptAssignment.run(item.kind, item.assertionId);
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
    if (payload.webhookEvents !== undefined) replaceTable(db, "webhook_events");
    if (payload.taskSnapshots !== undefined) replaceTable(db, "task_snapshots");
    if (payload.runtimeTasks !== undefined) replaceTable(db, "runtime_tasks");
    if (payload.taskFlows !== undefined) replaceTable(db, "task_flows");
    if (payload.auditFindings !== undefined) replaceTable(db, "audit_findings");
    if (payload.memoryHealth !== undefined) replaceTable(db, "memory_health");
    if (payload.cronJobs !== undefined) replaceTable(db, "cron_jobs");
    if (payload.cronRuns !== undefined) replaceTable(db, "cron_runs");
    if (payload.routingAttempts !== undefined) replaceTable(db, "routing_attempts");

    for (const event of payload.webhookEvents ?? []) {
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

    for (const task of payload.taskSnapshots ?? []) {
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

    for (const task of payload.runtimeTasks ?? []) {
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

    for (const flow of payload.taskFlows ?? []) {
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

    for (const finding of payload.auditFindings ?? []) {
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
