// @vitest-environment node
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { importSemanticConceptProposalRun, listSemanticConceptProposalRuns, openMissionControlDb } from "@ocmc/db";

let stateDir: string;
const originalStateDir = process.env.MISSION_CONTROL_STATE_DIR;
const originalSemanticFlag = process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;

const semanticPrompt = {
  promptVersion: { promptId: "semantic-concept-synthesis", version: "test", contractVersion: "semantic-contracts/v1" },
  model: { provider: "openai", model: "gpt-test" },
  outputSchemaId: "openclaw.semantic.SemanticConceptSynthesisOutput.v1",
};

function semanticRun() {
  return {
    proposalRunId: "proposal-run:review",
    sourceWindow: {},
    indexVersion: "index:latest",
    registrySnapshotVersion: "registry:latest",
    promptVersion: semanticPrompt.promptVersion,
    generatedAt: "2026-06-19T09:00:00.000Z",
    diagnostics: [],
    audit: { provider: { provider: "openai", model: "gpt-test" }, droppedProposals: [] },
    proposals: [
      {
        proposalId: "proposal:reject-me",
        canonicalLabelSuggestion: "Reject Me",
        definition: "Proposal that should leave review.",
        whyItMatters: "It validates reject behavior.",
        scope: "operational_process",
        confidence: 0.9,
        registryAction: "propose_new",
        aliasesSuggested: [],
        linkedActionIds: [],
        linkedDecisionIds: [],
        linkedEvidenceWindowIds: [],
        prompt: semanticPrompt,
      },
      {
        proposalId: "proposal:keep-me",
        canonicalLabelSuggestion: "Keep Me",
        definition: "Proposal that should remain pending.",
        whyItMatters: "It validates review filtering.",
        scope: "operational_process",
        confidence: 0.8,
        registryAction: "propose_new",
        aliasesSuggested: [],
        linkedActionIds: [],
        linkedDecisionIds: [],
        linkedEvidenceWindowIds: [],
        prompt: semanticPrompt,
      },
    ],
  };
}

async function loadRoutes() {
  vi.resetModules();
  const [runsRoute, rejectRoute] = await Promise.all([
    import("./route"),
    import("../proposals/[id]/reject/route"),
  ]);
  return { runsRoute, rejectRoute };
}

beforeEach(() => {
  stateDir = path.join(os.tmpdir(), `ocmc-semantic-runs-route-${process.pid}-${Date.now()}-${Math.random()}`);
  mkdirSync(stateDir, { recursive: true });
  process.env.MISSION_CONTROL_STATE_DIR = stateDir;
  process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = "1";
});

afterEach(() => {
  if (originalStateDir == null) {
    delete process.env.MISSION_CONTROL_STATE_DIR;
  } else {
    process.env.MISSION_CONTROL_STATE_DIR = originalStateDir;
  }
  if (originalSemanticFlag == null) {
    delete process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;
  } else {
    process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = originalSemanticFlag;
  }
  rmSync(stateDir, { recursive: true, force: true });
  vi.resetModules();
});

test("proposal run list exposes skipped/suppressed import diagnostics in raw audit JSON", async () => {
  const dbPath = path.join(stateDir, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  try {
    const run = semanticRun();
    run.proposals.push({
      proposalId: "proposal:confidence-zero",
      canonicalLabelSuggestion: "Zero Confidence Noise",
      definition: "Invalid proposal that should be skipped.",
      whyItMatters: "It validates fail-closed import diagnostics.",
      scope: "operational_process",
      confidence: 0,
      registryAction: "propose_new",
      aliasesSuggested: [],
      linkedActionIds: [],
      linkedDecisionIds: [],
      linkedEvidenceWindowIds: [],
      prompt: semanticPrompt,
    });
    const imported = importSemanticConceptProposalRun(db, {
      ...run,
      audit: { droppedProposals: ["suppressed confidence-zero proposal Zero Confidence Noise"] },
    });
    assert.equal(imported.proposalsImported, 2);
    assert.equal(imported.proposalsSkipped, 1);
  } finally {
    db.close();
  }

  const { runsRoute } = await loadRoutes();
  const response = await runsRoute.GET();
  assert.equal(response.status, 200);
  const payload = await response.json() as { proposalRuns: Array<{ rawJson: string; proposals: Array<{ proposalId: string }> }> };
  assert.deepEqual(payload.proposalRuns[0].proposals.map((proposal) => proposal.proposalId), ["proposal:reject-me", "proposal:keep-me"]);
  const rawJson = JSON.parse(payload.proposalRuns[0].rawJson) as { importDiagnostics?: { proposalsSkipped?: number; diagnostics?: string[] }; audit?: { droppedProposals?: string[] } };
  assert.equal(rawJson.importDiagnostics?.proposalsSkipped, 1);
  assert.match(rawJson.importDiagnostics?.diagnostics?.join("\n") ?? "", /confidence must be > 0/u);
  assert.match(rawJson.audit?.droppedProposals?.join("\n") ?? "", /suppressed confidence-zero/u);
});

test("proposal run list keeps operational all-skipped runs visible for diagnostics", async () => {
  const dbPath = path.join(stateDir, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  try {
    const run = {
      ...semanticRun(),
      proposalRunId: "proposal-run:all-skipped",
      generatedAt: "2026-06-19T10:00:00.000Z",
      proposals: [
        {
          proposalId: "proposal:all-skipped-confidence-zero",
          canonicalLabelSuggestion: "All Skipped Noise",
          definition: "Invalid all-skipped proposal.",
          whyItMatters: "It validates visible safe-failure diagnostics.",
          scope: "operational_process",
          confidence: 0,
          registryAction: "propose_new",
          aliasesSuggested: [],
          linkedActionIds: [],
          linkedDecisionIds: [],
          linkedEvidenceWindowIds: [],
          prompt: semanticPrompt,
        },
      ],
      audit: { provider: { provider: "openai", model: "gpt-test" }, droppedProposals: ["suppressed vague all-skipped proposal"] },
    };
    const imported = importSemanticConceptProposalRun(db, run);
    assert.equal(imported.proposalsImported, 0);
    assert.equal(imported.proposalsSkipped, 1);
  } finally {
    db.close();
  }

  const { runsRoute } = await loadRoutes();
  const response = await runsRoute.GET();
  assert.equal(response.status, 200);
  const payload = await response.json() as { proposalRuns: Array<{ proposalRunId: string; rawJson: string; proposals: Array<{ proposalId: string }> }> };
  const run = payload.proposalRuns.find((item) => item.proposalRunId === "proposal-run:all-skipped");
  assert.ok(run);
  assert.deepEqual(run.proposals, []);
  const rawJson = JSON.parse(run.rawJson) as { importDiagnostics?: { proposalsSkipped?: number; diagnostics?: string[] }; audit?: { provider?: { provider?: string }; droppedProposals?: string[] } };
  assert.equal(rawJson.audit?.provider?.provider, "openai");
  assert.equal(rawJson.importDiagnostics?.proposalsSkipped, 1);
  assert.match(rawJson.importDiagnostics?.diagnostics?.join("\n") ?? "", /confidence must be > 0/u);
  assert.match(rawJson.audit?.droppedProposals?.join("\n") ?? "", /suppressed vague all-skipped/u);
});

test("proposal run list keeps calibrated fallback runs visible for review", async () => {
  const dbPath = path.join(stateDir, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  try {
    const run = {
      ...semanticRun(),
      proposalRunId: "proposal-run:calibrated-fallback",
      generatedAt: "2026-06-20T12:00:00.000Z",
      promptVersion: { ...semanticPrompt.promptVersion, version: "fallback-calibrated-v1" },
      diagnostics: ["fallback_generation_mode: deterministic calibrated synthesis over last 24 meetings plus live assertions"],
      audit: { provider: { provider: "local-deterministic", model: "calibrated-fallback" }, droppedProposals: [] },
    };
    const imported = importSemanticConceptProposalRun(db, run);
    assert.equal(imported.proposalsImported, 2);
  } finally {
    db.close();
  }

  const { runsRoute } = await loadRoutes();
  const response = await runsRoute.GET();
  assert.equal(response.status, 200);
  const payload = await response.json() as { proposalRuns: Array<{ proposalRunId: string; rawJson: string; proposals: Array<{ proposalId: string }> }> };
  const run = payload.proposalRuns.find((item) => item.proposalRunId === "proposal-run:calibrated-fallback");
  assert.ok(run);
  const rawJson = JSON.parse(run.rawJson) as { audit?: { provider?: { provider?: string } }; diagnostics?: string[] };
  assert.equal(rawJson.audit?.provider?.provider, "local-deterministic");
  assert.match(rawJson.diagnostics?.join("\n") ?? "", /fallback_generation_mode/u);
});

test("proposal review list preserves rejected proposals durably", async () => {
  const dbPath = path.join(stateDir, "mission-control.sqlite");
  const db = openMissionControlDb(dbPath);
  try {
    importSemanticConceptProposalRun(db, semanticRun());
  } finally {
    db.close();
  }

  const { runsRoute, rejectRoute } = await loadRoutes();
  const beforeResponse = await runsRoute.GET();
  assert.equal(beforeResponse.status, 200);
  const beforePayload = await beforeResponse.json() as { proposalRuns: Array<{ proposals: Array<{ proposalId: string }> }> };
  assert.deepEqual(beforePayload.proposalRuns[0].proposals.map((proposal) => proposal.proposalId), ["proposal:reject-me", "proposal:keep-me"]);

  const rejectResponse = await rejectRoute.POST(
    new Request("http://localhost/api/accountability/semantic/proposals/proposal%3Areject-me/reject", { method: "POST", body: "{}" }),
    { params: { id: "proposal%3Areject-me" } },
  );
  assert.equal(rejectResponse.status, 200);

  const afterResponse = await runsRoute.GET();
  assert.equal(afterResponse.status, 200);
  const afterPayload = await afterResponse.json() as { proposalRuns: Array<{ proposals: Array<{ proposalId: string; reviewStatus?: string }> }> };
  assert.deepEqual(afterPayload.proposalRuns[0].proposals.map((proposal) => proposal.proposalId), ["proposal:reject-me", "proposal:keep-me"]);
  assert.equal(afterPayload.proposalRuns[0].proposals.find((proposal) => proposal.proposalId === "proposal:reject-me")?.reviewStatus, "rejected");

  const verify = openMissionControlDb(dbPath);
  try {
    const allProposals = listSemanticConceptProposalRuns(verify, { reviewStatus: "all" })[0].proposals;
    assert.equal(allProposals.find((proposal) => proposal.proposalId === "proposal:reject-me")?.reviewStatus, "rejected");
    assert.equal(allProposals.some((proposal) => proposal.proposalId === "proposal:keep-me"), true);
  } finally {
    verify.close();
  }

  const rejectLastResponse = await rejectRoute.POST(
    new Request("http://localhost/api/accountability/semantic/proposals/proposal%3Akeep-me/reject", { method: "POST", body: "{}" }),
    { params: { id: "proposal%3Akeep-me" } },
  );
  assert.equal(rejectLastResponse.status, 200);

  const emptyResponse = await runsRoute.GET();
  assert.equal(emptyResponse.status, 200);
  const emptyPayload = await emptyResponse.json() as { proposalRuns: Array<{ proposals: Array<{ proposalId: string; reviewStatus?: string }> }> };
  assert.deepEqual(emptyPayload.proposalRuns[0].proposals.map((proposal) => proposal.proposalId), ["proposal:reject-me", "proposal:keep-me"]);
});
