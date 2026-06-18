import { createHash } from "node:crypto";
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
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_assertion ON assertion_associations (assertion_kind, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_meeting_version ON assertion_associations (meeting_id, document_version_id);
    CREATE INDEX IF NOT EXISTS idx_assertion_associations_identity ON assertion_associations (identity_id);
    CREATE INDEX IF NOT EXISTS idx_meeting_ingestion_runs_path ON meeting_ingestion_runs (canonical_source_path, started_at DESC);
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

    bootstrapMyntIdentitiesFromCurrentMeetings(db, input.ingestedAt);
    deriveAssertionAssociationsForMeetingVersion(db, meetingId, documentVersionId, input.ingestedAt);

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
  const deleteAssociations = db.prepare(`
    DELETE FROM assertion_associations
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
