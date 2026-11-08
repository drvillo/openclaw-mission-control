import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const webhookEvents = sqliteTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  routeId: text("route_id"),
  flowId: text("flow_id"),
  ownerAgent: text("owner_agent"),
  status: text("status").notNull(),
  payloadPath: text("payload_path"),
  correlationId: text("correlation_id"),
  lastError: text("last_error"),
  attemptCount: integer("attempt_count").notNull().default(0),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const taskSnapshots = sqliteTable("task_snapshots", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  board: text("board").notNull(),
  status: text("status").notNull(),
  owner: text("owner").notNull(),
  assigneeType: text("assignee_type").notNull(),
  assignee: text("assignee"),
  agentStatus: text("agent_status").notNull(),
  createdOn: text("created_on").notNull(),
  remindOn: text("remind_on").notNull(),
  runId: text("run_id").notNull(),
  flowId: text("flow_id"),
  detailsRef: text("details_ref").notNull(),
  resultsRef: text("results_ref").notNull(),
  logRef: text("log_ref").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const runtimeTasks = sqliteTable("runtime_tasks", {
  taskId: text("task_id").primaryKey(),
  runtime: text("runtime"),
  status: text("status").notNull(),
  agentId: text("agent_id"),
  label: text("label"),
  ownerKey: text("owner_key"),
  sourceId: text("source_id"),
  runId: text("run_id"),
  deliveryStatus: text("delivery_status"),
  terminalSummary: text("terminal_summary"),
  terminalOutcome: text("terminal_outcome"),
  createdAt: integer("created_at"),
  startedAt: integer("started_at"),
  endedAt: integer("ended_at"),
  lastEventAt: integer("last_event_at"),
  cleanupAfter: integer("cleanup_after"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const runtimeInvocations = sqliteTable("runtime_invocations", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  agentId: text("agent_id").notNull(),
  instruction: text("instruction").notNull(),
  contextRefsJson: text("context_refs_json").notNull(),
  mcObjectType: text("mc_object_type"),
  mcObjectId: text("mc_object_id"),
  obsidianTaskId: text("obsidian_task_id"),
  detailsPath: text("details_path"),
  model: text("model"),
  thinking: text("thinking"),
  timeoutSeconds: integer("timeout_seconds"),
  metadataJson: text("metadata_json").notNull(),
  status: text("status").notNull(),
  sessionKey: text("session_key"),
  runId: text("run_id"),
  runtimeTaskId: text("runtime_task_id"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  terminalAt: text("terminal_at"),
});

export const taskFlows = sqliteTable("task_flows", {
  flowId: text("flow_id").primaryKey(),
  syncMode: text("sync_mode"),
  controllerId: text("controller_id"),
  ownerKey: text("owner_key"),
  goal: text("goal"),
  status: text("status").notNull(),
  currentStep: text("current_step"),
  blockedTaskId: text("blocked_task_id"),
  blockedSummary: text("blocked_summary"),
  createdAt: integer("created_at"),
  startedAt: integer("started_at"),
  endedAt: integer("ended_at"),
  lastEventAt: integer("last_event_at"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const auditFindings = sqliteTable("audit_findings", {
  findingId: text("finding_id").primaryKey(),
  kind: text("kind").notNull(),
  severity: text("severity").notNull(),
  code: text("code").notNull(),
  status: text("status"),
  token: text("token"),
  detail: text("detail").notNull(),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const memoryHealth = sqliteTable("memory_health", {
  workspaceId: text("workspace_id").primaryKey(),
  workspacePath: text("workspace_path").notNull(),
  hasAgentsMd: integer("has_agents_md", { mode: "boolean" }).notNull().default(false),
  hasMemoryMd: integer("has_memory_md", { mode: "boolean" }).notNull().default(false),
  memoryDirPresent: integer("memory_dir_present", { mode: "boolean" }).notNull().default(false),
  hasTodayDaily: integer("has_today_daily", { mode: "boolean" }).notNull().default(false),
  latestDaily: text("latest_daily"),
  qmdHealthy: integer("qmd_healthy", { mode: "boolean" }).notNull().default(false),
  qmdMessage: text("qmd_message").notNull(),
  status: text("status").notNull(),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const cronJobs = sqliteTable("cron_jobs", {
  jobId: text("job_id").primaryKey(),
  name: text("name").notNull(),
  agentId: text("agent_id").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  scheduleKind: text("schedule_kind").notNull(),
  scheduleLabel: text("schedule_label").notNull(),
  sessionTarget: text("session_target"),
  wakeMode: text("wake_mode"),
  lastRunStatus: text("last_run_status"),
  lastRunAtMs: integer("last_run_at_ms"),
  nextRunAtMs: integer("next_run_at_ms"),
  lastDurationMs: integer("last_duration_ms"),
  deliveryMode: text("delivery_mode"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const cronRuns = sqliteTable("cron_runs", {
  runId: text("run_id").primaryKey(),
  jobId: text("job_id").notNull(),
  ts: integer("ts").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  summary: text("summary"),
  delivered: integer("delivered", { mode: "boolean" }),
  deliveryStatus: text("delivery_status"),
  sessionId: text("session_id"),
  sessionKey: text("session_key"),
  runAtMs: integer("run_at_ms"),
  durationMs: integer("duration_ms"),
  nextRunAtMs: integer("next_run_at_ms"),
  model: text("model"),
  provider: text("provider"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const prSwarmRuns = sqliteTable("pr_swarm_runs", {
  runId: text("run_id").primaryKey(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  headSha: text("head_sha").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  artifactsDir: text("artifacts_dir").notNull(),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const prSwarmBridgeEvents = sqliteTable("pr_swarm_bridge_events", {
  eventId: text("event_id").primaryKey(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number"),
  headSha: text("head_sha"),
  action: text("action"),
  status: text("status").notNull(),
  dedupeKey: text("dedupe_key"),
  githubRunId: text("github_run_id"),
  githubRunAttempt: text("github_run_attempt"),
  failureReason: text("failure_reason"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const prSwarmFixAttempts = sqliteTable("pr_swarm_fix_attempts", {
  attemptId: text("attempt_id").primaryKey(),
  runId: text("run_id").notNull(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  baseHeadSha: text("base_head_sha").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  patchArtifactPath: text("patch_artifact_path"),
  rereviewRunId: text("rereview_run_id"),
  recordedAt: text("recorded_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const routingAttempts = sqliteTable("routing_attempts", {
  routingId: text("routing_id").primaryKey(),
  recordedAt: text("recorded_at").notNull(),
  sourceAgent: text("source_agent").notNull(),
  sourceSessionId: text("source_session_id").notNull(),
  sourceMessageId: text("source_message_id").notNull(),
  requestGroupKey: text("request_group_key").notNull(),
  requestExcerpt: text("request_excerpt").notNull(),
  policyRuleId: text("policy_rule_id"),
  policyDomain: text("policy_domain"),
  expectedTargetAgent: text("expected_target_agent"),
  actualTargetAgent: text("actual_target_agent"),
  mechanism: text("mechanism").notNull(),
  toolCallId: text("tool_call_id"),
  accepted: integer("accepted", { mode: "boolean" }),
  childSessionKey: text("child_session_key"),
  childSessionId: text("child_session_id"),
  runId: text("run_id"),
  status: text("status").notNull(),
  completionSummary: text("completion_summary"),
  failureMode: text("failure_mode").notNull(),
  recoveryMode: text("recovery_mode").notNull(),
  complianceStatus: text("compliance_status").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const sourceDocuments = sqliteTable("source_documents", {
  sourceDocumentId: text("source_document_id").primaryKey(),
  sourceType: text("source_type").notNull(),
  canonicalSourcePath: text("canonical_source_path").notNull(),
  obsidianRef: text("obsidian_ref").notNull(),
  absolutePath: text("absolute_path").notNull(),
  externalSourceId: text("external_source_id"),
  playbackUrl: text("playback_url"),
  shareUrl: text("share_url"),
  currentVersionId: text("current_version_id"),
  lastIngestedAt: text("last_ingested_at"),
  lastIngestionStatus: text("last_ingestion_status").notNull(),
  lastIngestionError: text("last_ingestion_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documentVersions = sqliteTable("document_versions", {
  documentVersionId: text("document_version_id").primaryKey(),
  sourceDocumentId: text("source_document_id").notNull(),
  contentHash: text("content_hash").notNull(),
  rawMarkdown: text("raw_markdown").notNull(),
  pageSchemaVersion: text("page_schema_version"),
  capturedAt: text("captured_at").notNull(),
  processedAt: text("processed_at"),
  extractionRunId: text("extraction_run_id"),
});

export const extractionRuns = sqliteTable("extraction_runs", {
  extractionRunId: text("extraction_run_id").primaryKey(),
  sourceDocumentId: text("source_document_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  providerRunId: text("provider_run_id"),
  flowId: text("flow_id"),
  extractor: text("extractor"),
  model: text("model"),
  promptHash: text("prompt_hash"),
  transcriptSha256: text("transcript_sha256"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  processedAt: text("processed_at"),
  rawJson: text("raw_json").notNull(),
});

export const meetings = sqliteTable("meetings", {
  meetingId: text("meeting_id").primaryKey(),
  sourceDocumentId: text("source_document_id").notNull(),
  currentDocumentVersionId: text("current_document_version_id").notNull(),
  recordingId: text("recording_id"),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  startedAt: text("started_at"),
  meetingDay: text("meeting_day"),
  meetingMonth: text("meeting_month"),
  playbackUrl: text("playback_url"),
  shareUrl: text("share_url"),
  transcriptSourcePath: text("transcript_source_path").notNull(),
  transcriptObsidianRef: text("transcript_obsidian_ref").notNull(),
  participantCount: integer("participant_count").notNull().default(0),
  actionCount: integer("action_count").notNull().default(0),
  decisionCount: integer("decision_count").notNull().default(0),
  lastIngestedAt: text("last_ingested_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const meetingParticipants = sqliteTable("meeting_participants", {
  meetingParticipantId: text("meeting_participant_id").primaryKey(),
  meetingId: text("meeting_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  sequence: integer("sequence").notNull(),
  rawName: text("raw_name").notNull(),
  participantKey: text("participant_key"),
  identityId: text("identity_id"),
});

export const identities = sqliteTable("identities", {
  identityId: text("identity_id").primaryKey(),
  displayName: text("display_name").notNull(),
  primaryEmail: text("primary_email"),
  isSelf: integer("is_self", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("legacy"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const identityAliases = sqliteTable("identity_aliases", {
  identityAliasId: text("identity_alias_id").primaryKey(),
  identityId: text("identity_id").notNull(),
  aliasType: text("alias_type").notNull(),
  aliasValue: text("alias_value").notNull(),
  createdAt: text("created_at").notNull(),
});

export const myntArchivedItems = sqliteTable("mynt_archived_items", {
  itemId: text("item_id").primaryKey(),
  archivedAt: text("archived_at").notNull(),
});

export const myntSettings = sqliteTable("mynt_settings", {
  settingKey: text("setting_key").primaryKey(),
  settingValue: text("setting_value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const transcriptSegments = sqliteTable("transcript_segments", {
  transcriptSegmentId: text("transcript_segment_id").primaryKey(),
  meetingId: text("meeting_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  sequence: integer("sequence").notNull(),
  startTimestamp: text("start_timestamp").notNull(),
  endTimestamp: text("end_timestamp"),
  speakerRaw: text("speaker_raw").notNull(),
  speakerIdentityId: text("speaker_identity_id"),
  text: text("text").notNull(),
});

export const actionAssertions = sqliteTable("action_assertions", {
  actionAssertionId: text("action_assertion_id").primaryKey(),
  extractionRunId: text("extraction_run_id").notNull(),
  meetingId: text("meeting_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  externalAssertionId: text("external_assertion_id"),
  label: text("label").notNull(),
  status: text("status"),
  taskId: text("task_id"),
  detailsRef: text("details_ref"),
  rawAssignee: text("raw_assignee"),
  dueDate: text("due_date"),
  dueText: text("due_text"),
  confidence: text("confidence"),
  score: integer("score"),
  summary: text("summary").notNull(),
  evidenceText: text("evidence_text"),
  evidenceTargetTime: text("evidence_target_time"),
  fingerprint: text("fingerprint").notNull(),
  sequence: integer("sequence").notNull(),
  reviewStatus: text("review_status").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const decisionAssertions = sqliteTable("decision_assertions", {
  decisionAssertionId: text("decision_assertion_id").primaryKey(),
  extractionRunId: text("extraction_run_id").notNull(),
  meetingId: text("meeting_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  externalAssertionId: text("external_assertion_id"),
  label: text("label").notNull(),
  taskId: text("task_id"),
  detailsRef: text("details_ref"),
  rawOwner: text("raw_owner"),
  confidence: text("confidence"),
  score: integer("score"),
  summary: text("summary").notNull(),
  evidenceText: text("evidence_text"),
  evidenceTargetTime: text("evidence_target_time"),
  fingerprint: text("fingerprint").notNull(),
  sequence: integer("sequence").notNull(),
  reviewStatus: text("review_status").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const evidenceLinks = sqliteTable("evidence_links", {
  evidenceLinkId: text("evidence_link_id").primaryKey(),
  assertionKind: text("assertion_kind").notNull(),
  assertionId: text("assertion_id").notNull(),
  transcriptSegmentId: text("transcript_segment_id"),
  timestamp: text("timestamp").notNull(),
  quoteText: text("quote_text"),
  sequence: integer("sequence").notNull(),
});

export const reviewEvents = sqliteTable("review_events", {
  reviewEventId: text("review_event_id").primaryKey(),
  assertionKind: text("assertion_kind").notNull(),
  assertionId: text("assertion_id").notNull(),
  outcome: text("outcome").notNull(),
  targetObjectId: text("target_object_id"),
  reviewer: text("reviewer"),
  reviewedAt: text("reviewed_at").notNull(),
  note: text("note"),
});

export const assertionAssociations = sqliteTable("assertion_associations", {
  assertionAssociationId: text("assertion_association_id").primaryKey(),
  assertionKind: text("assertion_kind").notNull(),
  assertionId: text("assertion_id").notNull(),
  meetingId: text("meeting_id").notNull(),
  documentVersionId: text("document_version_id").notNull(),
  identityId: text("identity_id").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accountabilityConcepts = sqliteTable("accountability_concepts", {
  conceptId: text("concept_id").primaryKey(),
  label: text("label").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull(),
  mergedIntoConceptId: text("merged_into_concept_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accountabilityConceptAssignments = sqliteTable("accountability_concept_assignments", {
  assignmentId: text("assignment_id").primaryKey(),
  conceptId: text("concept_id").notNull(),
  assertionKind: text("assertion_kind").notNull(),
  assertionId: text("assertion_id").notNull(),
  source: text("source").notNull(),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accountabilityConceptEvents = sqliteTable("accountability_concept_events", {
  conceptEventId: text("concept_event_id").primaryKey(),
  conceptId: text("concept_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const meetingIngestionRuns = sqliteTable("meeting_ingestion_runs", {
  ingestionRunId: text("ingestion_run_id").primaryKey(),
  sourceDocumentId: text("source_document_id"),
  canonicalSourcePath: text("canonical_source_path").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  documentVersionId: text("document_version_id"),
  extractionRunId: text("extraction_run_id"),
  semanticStatus: text("semantic_status"),
  semanticMessage: text("semantic_message"),
  semanticProposalRunId: text("semantic_proposal_run_id"),
  semanticAutoAppliedCount: integer("semantic_auto_applied_count"),
  semanticFinishedAt: text("semantic_finished_at"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const semanticRefreshRuns = sqliteTable("semantic_refresh_runs", {
  semanticRefreshRunId: text("semantic_refresh_run_id").primaryKey(),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  source: text("source"),
  sourceDocumentId: text("source_document_id"),
  documentVersionId: text("document_version_id"),
  ingestionRunId: text("ingestion_run_id"),
  indexVersionId: text("index_version_id"),
  proposalRunId: text("proposal_run_id"),
  proposalsImported: integer("proposals_imported").notNull().default(0),
  autoApplied: integer("auto_applied").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const semanticConceptProposalRuns = sqliteTable("semantic_concept_proposal_runs", {
  proposalRunId: text("proposal_run_id").primaryKey(),
  sourceWindowJson: text("source_window_json").notNull(),
  indexVersion: text("index_version").notNull(),
  registrySnapshotVersion: text("registry_snapshot_version").notNull(),
  promptVersionJson: text("prompt_version_json").notNull(),
  generatedAt: text("generated_at").notNull(),
  importedAt: text("imported_at").notNull(),
  diagnosticsJson: text("diagnostics_json").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const semanticConceptProposals = sqliteTable("semantic_concept_proposals", {
  proposalId: text("proposal_id").primaryKey(),
  proposalRunId: text("proposal_run_id").notNull(),
  canonicalLabelSuggestion: text("canonical_label_suggestion").notNull(),
  definition: text("definition").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  scope: text("scope").notNull(),
  confidence: real("confidence").notNull(),
  registryAction: text("registry_action").notNull(),
  existingConceptId: text("existing_concept_id"),
  aliasesSuggestedJson: text("aliases_suggested_json").notNull(),
  linkedActionIdsJson: text("linked_action_ids_json").notNull(),
  linkedDecisionIdsJson: text("linked_decision_ids_json").notNull(),
  linkedEvidenceWindowIdsJson: text("linked_evidence_window_ids_json").notNull(),
  reviewStatus: text("review_status").notNull().default("pending"),
  targetConceptId: text("target_concept_id"),
  rawJson: text("raw_json").notNull(),
  importedAt: text("imported_at").notNull(),
  reviewedAt: text("reviewed_at"),
});

export const semanticConceptProposalReviews = sqliteTable("semantic_concept_proposal_reviews", {
  reviewId: text("review_id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  decision: text("decision").notNull(),
  targetConceptId: text("target_concept_id"),
  reviewer: text("reviewer"),
  reasonsJson: text("reasons_json").notNull(),
  aliasesAcceptedJson: text("aliases_accepted_json").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
});

export const semanticConceptSuppressions = sqliteTable("semantic_concept_suppressions", {
  suppressionId: text("suppression_id").primaryKey(),
  normalizedLabel: text("normalized_label").notNull(),
  proposalId: text("proposal_id"),
  reason: text("reason"),
  reviewer: text("reviewer"),
  createdAt: text("created_at").notNull(),
});
