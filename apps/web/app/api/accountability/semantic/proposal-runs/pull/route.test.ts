import { afterEach, assert, test, vi } from "vitest";

const originalFlag = process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

afterEach(() => {
  if (originalFlag == null) {
    delete process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;
  } else {
    process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = originalFlag;
  }
  vi.resetModules();
  vi.restoreAllMocks();
});

test("semantic proposal pull route is feature-flagged", async () => {
  delete process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;
  vi.doMock("../../../../../lib/semantic-layer-client", () => ({ pullMissionControlSemanticProposalRun: vi.fn() }));
  const route = await loadRoute();
  const response = await route.POST(new Request("http://localhost/api/accountability/semantic/proposal-runs/pull", { method: "POST", body: "{}" }));
  assert.equal(response.status, 404);
  const payload = await response.json() as { disabled?: boolean };
  assert.equal(payload.disabled, true);
});

test("semantic proposal pull route delegates to semantic-layer client and imports by default", async () => {
  process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = "1";
  const pull = vi.fn().mockResolvedValue({
    proposalRun: { proposalRunId: "proposal-run:ui", proposals: [] },
    resolution: { resolutions: [], unresolved: [] },
    imported: { proposalRunId: "proposal-run:ui", proposalsImported: 2, evidencePacketsImported: 1 },
  });
  vi.doMock("../../../../../lib/semantic-layer-client", () => ({ pullMissionControlSemanticProposalRun: pull }));

  const route = await loadRoute();
  const response = await route.POST(new Request("http://localhost/api/accountability/semantic/proposal-runs/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "review", reason: "test", maxProposals: 3, maxPackets: 4 }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(pull.mock.calls[0][0], { query: "review", reason: "test", importIntoReview: true, maxProposals: 3, maxPackets: 4 });
  const payload = await response.json() as { ok: boolean; summary: string };
  assert.equal(payload.ok, true);
  assert.match(payload.summary, /imported 2 proposals/u);
});
