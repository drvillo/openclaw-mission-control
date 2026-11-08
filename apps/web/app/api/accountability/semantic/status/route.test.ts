import { afterEach, assert, test, vi } from "vitest";

const originalSemanticFlag = process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

afterEach(() => {
  if (originalSemanticFlag == null) {
    delete process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;
  } else {
    process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = originalSemanticFlag;
  }
  vi.resetModules();
  vi.restoreAllMocks();
});

test("semantic status route preserves the Mission Control consumer boundary", async () => {
  process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS = "1";
  const status = {
    semanticDbPath: "/tmp/semantic.sqlite",
    extractionSource: { kind: "jsonl", path: "/tmp/extractions.jsonl", bundleCount: 2, diagnostics: [] },
    index: { latestIndexVersion: { indexVersionId: "index:ready" } },
    providers: {
      synthesis: { provider: "openai", model: "gpt-4.1-mini", operational: true, diagnostics: [] },
      embedding: { provider: "openai", model: "text-embedding-3-small", operational: true, diagnostics: [] },
    },
    operational: true,
    diagnostics: [],
  };
  vi.doMock("../../../../lib/semantic-layer-client", () => ({
    getMissionControlSemanticStatus: vi.fn().mockResolvedValue(status),
    semanticExtractionSourceSummary: vi.fn(() => ({ semanticDbPath: "/tmp/semantic.sqlite", extractionPath: "/tmp/extractions.jsonl", noteRoots: [] })),
  }));

  const route = await loadRoute();
  const response = await route.GET();
  assert.equal(response.status, 200);
  const payload = await response.json() as { ok: boolean; status: typeof status };
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.status, status);
});

test("semantic status route remains feature-flagged", async () => {
  delete process.env.MISSION_CONTROL_SEMANTIC_CONCEPTS;
  vi.doMock("../../../../lib/semantic-layer-client", () => ({
    getMissionControlSemanticStatus: vi.fn(),
    semanticExtractionSourceSummary: vi.fn(() => ({ semanticDbPath: "/tmp/semantic.sqlite", extractionPath: null, noteRoots: [] })),
  }));

  const route = await loadRoute();
  const response = await route.GET();
  assert.equal(response.status, 404);
  const payload = await response.json() as { disabled?: boolean; config?: { semanticDbPath?: string } };
  assert.equal(payload.disabled, true);
  assert.equal(payload.config?.semanticDbPath, "/tmp/semantic.sqlite");
});
