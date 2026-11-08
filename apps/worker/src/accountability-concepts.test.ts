import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assignAssertionConcept,
  autoApplySafeSemanticConceptProposals,
  createAccountabilityConcept,
  ensureAccountabilityConceptSchema,
  listAccountabilityConcepts,
  listSemanticConceptProposals,
  loadAccountabilityConceptMetadataForAssertions,
  mergeAccountabilityConcepts,
  openMissionControlDb,
  importSemanticConceptProposalRun,
  resolveSemanticConceptProposalRunAssertionTargets,
  reviewSemanticConceptProposal,
  suppressSemanticConceptProposal,
} from "@ocmc/db";

function tempDb() {
  return openMissionControlDb(path.join(os.tmpdir(), `ocmc-concepts-${process.pid}-${Date.now()}-${Math.random()}.sqlite`));
}

function insertAssertionMeeting(db: ReturnType<typeof tempDb>, input: { meetingId: string; documentVersionId: string; title: string; day: string; actionId?: string; decisionId?: string; summary: string; owner: string }) {
  db.prepare(`
    INSERT INTO meetings (
      meeting_id, source_document_id, current_document_version_id, recording_id, source_type, title,
      started_at, meeting_day, meeting_month, playback_url, share_url, transcript_source_path, transcript_obsidian_ref,
      participant_count, action_count, decision_count, last_ingested_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'test', ?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?);
  `).run(
    input.meetingId,
    `source-${input.meetingId}`,
    input.documentVersionId,
    `recording-${input.meetingId}`,
    input.title,
    `${input.day}T10:00:00Z`,
    input.day,
    input.day.slice(0, 7),
    `/tmp/${input.meetingId}.md`,
    `Meeting Recordings/Fathom/${input.meetingId}`,
    input.actionId ? 1 : 0,
    input.decisionId ? 1 : 0,
    input.day,
    input.day,
    input.day,
  );
  if (input.actionId) {
    db.prepare(`
      INSERT INTO action_assertions (
        action_assertion_id, extraction_run_id, meeting_id, document_version_id, external_assertion_id, label,
        status, task_id, details_ref, raw_assignee, due_date, due_text, confidence, score, summary,
        evidence_text, evidence_target_time, fingerprint, sequence, review_status, raw_json
      ) VALUES (?, ?, ?, ?, NULL, 'Action', 'todo', NULL, NULL, ?, NULL, NULL, 'high', 8, ?, ?, '00:01:00', ?, 1, 'needs_review', '{}');
    `).run(input.actionId, `run-${input.meetingId}`, input.meetingId, input.documentVersionId, input.owner, input.summary, input.summary, `fp-${input.actionId}`);
  }
  if (input.decisionId) {
    db.prepare(`
      INSERT INTO decision_assertions (
        decision_assertion_id, extraction_run_id, meeting_id, document_version_id, external_assertion_id, label,
        task_id, details_ref, raw_owner, confidence, score, summary, evidence_text, evidence_target_time,
        fingerprint, sequence, review_status, raw_json
      ) VALUES (?, ?, ?, ?, NULL, 'Decision', NULL, NULL, ?, 'high', 8, ?, ?, '00:02:00', ?, 1, 'needs_review', '{}');
    `).run(input.decisionId, `run-${input.meetingId}`, input.meetingId, input.documentVersionId, input.owner, input.summary, input.summary, `fp-${input.decisionId}`);
  }
}

test("concept schema and helper path enforce one assignment per assertion", () => {
  const db = tempDb();
  try {
    ensureAccountabilityConceptSchema(db);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'accountability_concept%';`).all() as Array<{ name: string }>;
    assert.deepEqual(tables.map((row) => row.name).sort(), ["accountability_concept_assignments", "accountability_concept_events", "accountability_concepts"]);

    const alpha = createAccountabilityConcept(db, { label: "Investigation agency", summary: "Agency follow-up" });
    const beta = createAccountabilityConcept(db, { label: "Vendor rollout", summary: "Rollout follow-up" });
    assignAssertionConcept(db, { conceptId: alpha.conceptId, assertionKind: "action", assertionId: "action-1", source: "auto", confidence: 0.7 });
    assignAssertionConcept(db, { conceptId: beta.conceptId, assertionKind: "action", assertionId: "action-1", source: "manual", confidence: null });

    const metadata = loadAccountabilityConceptMetadataForAssertions(db, [{ kind: "action", assertionId: "action-1" }]);
    assert.equal(metadata.get("action:action-1")?.id, beta.conceptId);
    assert.equal(metadata.get("action:action-1")?.assignmentSource, "manual");
  } finally {
    db.close();
  }
});

test("merge moves concept assignments and records events", () => {
  const db = tempDb();
  try {
    const source = createAccountabilityConcept(db, { label: "Legacy concept" });
    const target = createAccountabilityConcept(db, { label: "Surviving concept" });
    assignAssertionConcept(db, { conceptId: source.conceptId, assertionKind: "decision", assertionId: "decision-1", source: "manual" });

    const result = mergeAccountabilityConcepts(db, { fromConceptId: source.conceptId, toConceptId: target.conceptId });
    assert.equal(result.movedAssignments, 1);
    assert.equal(result.from.status, "merged");
    assert.equal(loadAccountabilityConceptMetadataForAssertions(db).get("decision:decision-1")?.id, target.conceptId);
    const events = db.prepare(`SELECT event_type as eventType FROM accountability_concept_events ORDER BY created_at;`).all() as Array<{ eventType: string }>;
    assert.ok(events.some((event) => event.eventType === "merge"));
  } finally {
    db.close();
  }
});

test("semantic proposal import stays shadow-only until accepted through concept helpers", () => {
  const db = tempDb();
  try {
    const run = {
      proposalRunId: "proposal-run:test",
      sourceWindow: { meetingIds: ["m1"] },
      indexVersion: "index:test",
      registrySnapshotVersion: "registry:test",
      promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
      generatedAt: "2026-06-18T10:00:00Z",
      evidencePackets: [{ packetId: "packet:test" }],
      diagnostics: [],
      proposals: [
        {
          proposalId: "proposal:test",
          proposalRunId: "proposal-run:test",
          canonicalLabelSuggestion: "Semantic Review Workflow",
          definition: "Review semantic concepts before product writes.",
          whyItMatters: "Prevents uncurated product truth writes.",
          scope: "operational_process",
          confidence: 0.82,
          registryAction: "propose_new",
          aliasesSuggested: ["Semantic curation"],
          linkedActionIds: ["action-semantic-1"],
          linkedDecisionIds: ["decision-semantic-1"],
          linkedEvidenceWindowIds: ["evidence-semantic-1"],
        },
      ],
    };
    const imported = importSemanticConceptProposalRun(db, run);
    assert.equal(imported.proposalsImported, 1);
    assert.equal(listAccountabilityConcepts(db, ["active"]).length, 0);
    const [unreadyProposal] = listSemanticConceptProposals(db, "proposal-run:test");
    assert.equal(unreadyProposal.applyReady, false);
    assert.deepEqual(unreadyProposal.missingTargets.sort(), ["action:action-semantic-1", "decision:decision-semantic-1"].sort());

    assert.throws(
      () => reviewSemanticConceptProposal(db, { proposalId: "proposal:test", decision: "accept", reviewer: "test" }),
      /linked assertions are not resolvable/u,
    );
    assert.equal(listAccountabilityConcepts(db, ["active"]).length, 0);

    insertAssertionMeeting(db, { meetingId: "semantic-m1", documentVersionId: "semantic-v1", title: "Semantic One", day: "2026-06-18", actionId: "action-semantic-1", summary: "Review semantic concepts before product writes", owner: "Alice" });
    insertAssertionMeeting(db, { meetingId: "semantic-m2", documentVersionId: "semantic-v2", title: "Semantic Two", day: "2026-06-19", decisionId: "decision-semantic-1", summary: "Review semantic concepts before product writes", owner: "Bob" });
    const [readyProposal] = listSemanticConceptProposals(db, "proposal-run:test");
    assert.equal(readyProposal.applyReady, true);
    assert.deepEqual(readyProposal.missingTargets, []);

    const applied = reviewSemanticConceptProposal(db, { proposalId: "proposal:test", decision: "accept", reviewer: "test" });
    assert.equal(applied.assignmentsCreatedOrUpdated, 2);
    assert.equal(listAccountabilityConcepts(db, ["active"]).length, 1);
    assert.equal(loadAccountabilityConceptMetadataForAssertions(db).get("action:action-semantic-1")?.label, "Semantic Review Workflow");
  } finally {
    db.close();
  }
});

test("semantic proposal import skips invalid confidence and normalizes percent confidence", () => {
  const db = tempDb();
  try {
    const validProposal = {
      proposalId: "proposal:valid-confidence",
      proposalRunId: "proposal-run:confidence-import",
      canonicalLabelSuggestion: "Semantic Confidence Import Gate",
      definition: "Import only semantic proposals with finite positive confidence.",
      whyItMatters: "Mission Control review should not receive invalid-confidence proposals.",
      scope: "operational_process",
      confidence: 0.82,
      registryAction: "propose_new",
      aliasesSuggested: [],
      linkedActionIds: [],
      linkedDecisionIds: [],
      linkedEvidenceWindowIds: [],
    };
    const imported = importSemanticConceptProposalRun(db, {
      proposalRunId: "proposal-run:confidence-import",
      sourceWindow: { meetingIds: [] },
      indexVersion: "index:test",
      registrySnapshotVersion: "registry:test",
      promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
      generatedAt: "2026-06-20T08:00:00Z",
      evidencePackets: [],
      diagnostics: [],
      proposals: [
        { ...validProposal },
        { ...validProposal, proposalId: "proposal:percent-confidence", canonicalLabelSuggestion: "Semantic Percent Confidence Gate", confidence: 82 },
        { ...validProposal, proposalId: "proposal:missing-confidence", confidence: undefined },
        { ...validProposal, proposalId: "proposal:null-confidence", confidence: null },
        { ...validProposal, proposalId: "proposal:string-confidence", confidence: "0.8" },
        { ...validProposal, proposalId: "proposal:nan-confidence", confidence: Number.NaN },
        { ...validProposal, proposalId: "proposal:zero-confidence", confidence: 0 },
        { ...validProposal, proposalId: "proposal:negative-confidence", confidence: -0.1 },
        { ...validProposal, proposalId: "proposal:too-large-confidence", confidence: 101 },
      ],
    });
    assert.equal(imported.proposalsImported, 2);
    assert.equal(imported.proposalsSkipped, 7);
    assert.ok(imported.diagnostics?.some((diagnostic) => diagnostic.includes("missing-confidence")));
    assert.ok(imported.diagnostics?.some((diagnostic) => diagnostic.includes("zero-confidence")));
    assert.ok(imported.diagnostics?.some((diagnostic) => diagnostic.includes("percent-confidence") && diagnostic.includes("normalized")));
    const proposals = listSemanticConceptProposals(db, "proposal-run:confidence-import", { reviewStatus: "all" });
    assert.deepEqual(proposals.map((proposal) => proposal.proposalId).sort(), ["proposal:percent-confidence", "proposal:valid-confidence"]);
    assert.equal(proposals.find((proposal) => proposal.proposalId === "proposal:percent-confidence")?.confidence, 0.82);
    const runRow = db.prepare(`SELECT diagnostics_json as diagnosticsJson, raw_json as rawJson FROM semantic_concept_proposal_runs WHERE proposal_run_id = ?`).get("proposal-run:confidence-import") as { diagnosticsJson: string; rawJson: string };
    assert.ok((JSON.parse(runRow.diagnosticsJson) as string[]).some((diagnostic) => diagnostic.includes("confidence")));
    assert.equal(JSON.parse(runRow.rawJson).importDiagnostics.proposalsSkipped, 7);
  } finally {
    db.close();
  }
});

test("semantic proposal resolver maps semantic candidate ids to existing MC assertions before import", () => {
  const db = tempDb();
  try {
    insertAssertionMeeting(db, { meetingId: "semantic-source", documentVersionId: "semantic-version", title: "Semantic Source", day: "2026-06-18", actionId: "action-existing", summary: "Review semantic concepts before product writes", owner: "Alice" });
    insertAssertionMeeting(db, { meetingId: "semantic-decision", documentVersionId: "semantic-decision-version", title: "Semantic Decision", day: "2026-06-19", decisionId: "decision-existing", summary: "Approve semantic evidence packet review", owner: "Bob" });

    const unresolvedRun = {
      proposalRunId: "proposal-run:resolved-candidates",
      sourceWindow: { meetingIds: ["semantic-source", "semantic-decision"] },
      indexVersion: "index:test",
      registrySnapshotVersion: "registry:test",
      promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
      generatedAt: "2026-06-18T10:00:00Z",
      evidencePackets: [{ packetId: "packet:test" }],
      diagnostics: [],
      proposals: [
        {
          proposalId: "proposal:resolved-candidates",
          proposalRunId: "proposal-run:resolved-candidates",
          canonicalLabelSuggestion: "Semantic Review Workflow",
          definition: "Review semantic concepts before product writes.",
          whyItMatters: "Prevents uncurated product truth writes.",
          scope: "operational_process",
          confidence: 0.82,
          registryAction: "propose_new",
          aliasesSuggested: ["Semantic curation"],
          linkedActionIds: ["semantic-candidate-action"],
          linkedDecisionIds: ["semantic-candidate-decision"],
          linkedEvidenceWindowIds: ["evidence-semantic-1"],
        },
      ],
    };

    const resolved = resolveSemanticConceptProposalRunAssertionTargets(db, unresolvedRun, [
      {
        candidateId: "semantic-candidate-action",
        kind: "action",
        text: "Review semantic concepts before product writes",
        sourceRef: { recordingId: "recording-semantic-source" },
      },
      {
        candidateId: "semantic-candidate-decision",
        kind: "decision",
        text: "Approve semantic evidence packet review",
        sourceRef: { recordingId: "recording-semantic-decision" },
      },
    ]);

    assert.deepEqual(resolved.unresolved, []);
    assert.equal(resolved.resolutions.find((item) => item.candidateId === "semantic-candidate-action")?.assertionId, "action-existing");
    assert.equal(resolved.resolutions.find((item) => item.candidateId === "semantic-candidate-decision")?.assertionId, "decision-existing");

    importSemanticConceptProposalRun(db, resolved.proposalRun);
    const applied = reviewSemanticConceptProposal(db, { proposalId: "proposal:resolved-candidates", decision: "accept", reviewer: "test" });
    assert.equal(applied.assignmentsCreatedOrUpdated, 2);
    assert.equal(loadAccountabilityConceptMetadataForAssertions(db).get("action:action-existing")?.label, "Semantic Review Workflow");
    assert.equal(loadAccountabilityConceptMetadataForAssertions(db).get("decision:decision-existing")?.label, "Semantic Review Workflow");
  } finally {
    db.close();
  }
});

test("semantic auto-apply accepts only high-confidence apply-ready proposals as semantic_auto", () => {
  const db = tempDb();
  try {
    insertAssertionMeeting(db, { meetingId: "semantic-auto-high", documentVersionId: "semantic-auto-v1", title: "Semantic Auto High", day: "2026-06-18", actionId: "action-auto-high", summary: "Create operational semantic concepts", owner: "Alice" });
    insertAssertionMeeting(db, { meetingId: "semantic-auto-low", documentVersionId: "semantic-auto-v2", title: "Semantic Auto Low", day: "2026-06-19", decisionId: "decision-auto-low", summary: "Discuss ambiguous semantic concepts", owner: "Bob" });
    const run = {
      proposalRunId: "proposal-run:auto-apply",
      sourceWindow: { meetingIds: ["semantic-auto-high", "semantic-auto-low"] },
      indexVersion: "index:test",
      registrySnapshotVersion: "registry:test",
      promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
      generatedAt: "2026-06-18T10:00:00Z",
      evidencePackets: [],
      diagnostics: [],
      proposals: [
        {
          proposalId: "proposal:auto-high",
          proposalRunId: "proposal-run:auto-apply",
          canonicalLabelSuggestion: "Semantic Autopilot Core",
          definition: "Automatically creates safe operational concepts.",
          whyItMatters: "Turns meeting ingestion into usable accountability concepts.",
          scope: "operational_process",
          confidence: 0.91,
          registryAction: "propose_new",
          aliasesSuggested: [],
          linkedActionIds: ["action-auto-high"],
          linkedDecisionIds: [],
          linkedEvidenceWindowIds: [],
        },
        {
          proposalId: "proposal:auto-low",
          proposalRunId: "proposal-run:auto-apply",
          canonicalLabelSuggestion: "Ambiguous Semantic Concept",
          definition: "Needs manual review.",
          whyItMatters: "Low confidence should remain pending.",
          scope: "operational_process",
          confidence: 0.62,
          registryAction: "propose_new",
          aliasesSuggested: [],
          linkedActionIds: [],
          linkedDecisionIds: ["decision-auto-low"],
          linkedEvidenceWindowIds: [],
        },
      ],
    };

    importSemanticConceptProposalRun(db, run);
    const result = autoApplySafeSemanticConceptProposals(db, { proposalRunId: "proposal-run:auto-apply" }, "2026-06-19T10:00:00.000Z");
    assert.equal(result.considered, 2);
    assert.equal(result.applied, 1);
    assert.equal(result.pending, 1);
    assert.deepEqual(result.appliedProposalIds, ["proposal:auto-high"]);

    const proposals = listSemanticConceptProposals(db, "proposal-run:auto-apply", { reviewStatus: "all" });
    assert.equal(proposals.find((proposal) => proposal.proposalId === "proposal:auto-high")?.reviewStatus, "accepted");
    assert.equal(proposals.find((proposal) => proposal.proposalId === "proposal:auto-low")?.reviewStatus, "pending");
    const metadata = loadAccountabilityConceptMetadataForAssertions(db);
    assert.equal(metadata.get("action:action-auto-high")?.label, "Semantic Autopilot Core");
    assert.equal(metadata.get("action:action-auto-high")?.assignmentSource, "semantic_auto");
    assert.equal(metadata.get("decision:decision-auto-low"), undefined);
    const events = db.prepare(`SELECT event_type as eventType, payload_json as payloadJson FROM accountability_concept_events ORDER BY created_at;`).all() as Array<{ eventType: string; payloadJson: string }>;
    const semanticAssign = events.find((event) => event.eventType === "semantic_auto_assign_assertion");
    assert.ok(semanticAssign);
    assert.equal(JSON.parse(semanticAssign.payloadJson).proposalId, "proposal:auto-high");
    assert.equal(JSON.parse(semanticAssign.payloadJson).proposalRunId, "proposal-run:auto-apply");
  } finally {
    db.close();
  }
});

test("semantic suppression keeps rejected suggestions from repeating", () => {
  const db = tempDb();
  try {
    const baseRun = {
      proposalRunId: "proposal-run:suppress-one",
      sourceWindow: {},
      indexVersion: "index:test",
      registrySnapshotVersion: "registry:test",
      promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
      generatedAt: "2026-06-18T10:00:00Z",
      evidencePackets: [],
      diagnostics: [],
      proposals: [{
        proposalId: "proposal:suppress-one",
        canonicalLabelSuggestion: "Repeated Bad Concept",
        definition: "Should not keep returning.",
        whyItMatters: "Suppressions are durable tuning state.",
        scope: "operational_process",
        confidence: 0.88,
        registryAction: "propose_new",
        aliasesSuggested: [],
        linkedActionIds: [],
        linkedDecisionIds: [],
        linkedEvidenceWindowIds: [],
      }],
    };
    importSemanticConceptProposalRun(db, baseRun);
    const suppressed = suppressSemanticConceptProposal(db, { proposalId: "proposal:suppress-one", reason: "too broad", reviewer: "test" });
    assert.equal(suppressed.suppressed, true);
    assert.equal(listSemanticConceptProposals(db, "proposal-run:suppress-one", { reviewStatus: "all" })[0].reviewStatus, "suppressed");

    importSemanticConceptProposalRun(db, {
      ...baseRun,
      proposalRunId: "proposal-run:suppress-two",
      proposals: [{ ...baseRun.proposals[0], proposalId: "proposal:suppress-two", proposalRunId: "proposal-run:suppress-two", canonicalLabelSuggestion: " repeated   bad concept " }],
    });
    assert.equal(listSemanticConceptProposals(db, "proposal-run:suppress-two", { reviewStatus: "all" })[0].reviewStatus, "suppressed");
  } finally {
    db.close();
  }
});
