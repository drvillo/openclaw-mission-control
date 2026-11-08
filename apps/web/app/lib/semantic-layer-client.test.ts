// @vitest-environment node
import os from "node:os";
import path from "node:path";
import { afterEach, assert, test, vi } from "vitest";

const originalEnv = {
  MISSION_CONTROL_SEMANTIC_DB_PATH: process.env.MISSION_CONTROL_SEMANTIC_DB_PATH,
  MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH: process.env.MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH,
  MISSION_CONTROL_SEMANTIC_NOTE_ROOTS: process.env.MISSION_CONTROL_SEMANTIC_NOTE_ROOTS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

test("semantic-layer client reports configured source and degraded status without owning extraction internals", async () => {
  const missingRoot = path.join(os.tmpdir(), `ocmc-semantic-missing-${process.pid}-${Date.now()}`);
  process.env.MISSION_CONTROL_SEMANTIC_DB_PATH = path.join(missingRoot, "semantic.sqlite");
  process.env.MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH = "";
  process.env.MISSION_CONTROL_SEMANTIC_NOTE_ROOTS = missingRoot;
  vi.resetModules();
  vi.doMock("@openclaw/semantic-layer", () => ({
    openSemanticStore: vi.fn(),
    semanticIndexStatus: vi.fn(),
    loadExtractionBundlesFile: vi.fn(),
    discoverMarkdownNotes: vi.fn(() => []),
    parseSemanticMeetingNoteFile: vi.fn(),
    extractSemanticMeetingNote: vi.fn(),
  }));

  const client = await import("./semantic-layer-client");
  assert.deepEqual(client.semanticExtractionSourceSummary(), {
    semanticDbPath: path.join(missingRoot, "semantic.sqlite"),
    extractionPath: null,
    noteRoots: [path.resolve(missingRoot)],
  });

  const status = await client.getMissionControlSemanticStatus();
  assert.equal(status.semanticDbPath, path.join(missingRoot, "semantic.sqlite"));
  assert.equal(status.extractionSource.kind, "none");
  assert.equal(status.extractionSource.bundleCount, 0);
  assert.equal(status.index, null);
  assert.match(status.extractionSource.diagnostics.join("; "), /no semantic extraction path/u);
});
