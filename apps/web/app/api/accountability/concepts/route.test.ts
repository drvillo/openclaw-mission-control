// @vitest-environment node
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { createAccountabilityConcept, loadAccountabilityConceptMetadataForAssertions, openMissionControlDb } from "@ocmc/db";

let stateDir: string;
const originalMissionControlStateDir = process.env.MISSION_CONTROL_STATE_DIR;

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

async function post(body: Record<string, unknown>) {
  const route = await loadRoute();
  return route.POST(new Request("http://localhost/api/accountability/concepts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(() => {
  stateDir = path.join(os.tmpdir(), `ocmc-concepts-route-${process.pid}-${Date.now()}-${Math.random()}`);
  mkdirSync(stateDir, { recursive: true });
  process.env.MISSION_CONTROL_STATE_DIR = stateDir;
});

afterEach(() => {
  if (originalMissionControlStateDir == null) {
    delete process.env.MISSION_CONTROL_STATE_DIR;
  } else {
    process.env.MISSION_CONTROL_STATE_DIR = originalMissionControlStateDir;
  }
  rmSync(stateDir, { recursive: true, force: true });
  vi.resetModules();
});

test("concept curation route creates, renames, and assigns assertions", async () => {
  const createResponse = await post({ operation: "create", label: "Investigation agency", summary: "Agency follow-up" });
  assert.equal(createResponse.status, 200);
  const createPayload = await createResponse.json() as { ok: boolean; payload: { concept: { conceptId: string; label: string } } };
  assert.equal(createPayload.ok, true);
  assert.equal(createPayload.payload.concept.label, "Investigation agency");

  const renameResponse = await post({ operation: "rename", conceptId: createPayload.payload.concept.conceptId, label: "Agency accountability" });
  assert.equal(renameResponse.status, 200);

  const assignResponse = await post({
    operation: "assign_assertion",
    conceptId: createPayload.payload.concept.conceptId,
    assertionKind: "action",
    assertionId: "action-1",
  });
  assert.equal(assignResponse.status, 200);

  const db = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  try {
    const metadata = loadAccountabilityConceptMetadataForAssertions(db, [{ kind: "action", assertionId: "action-1" }]);
    assert.equal(metadata.get("action:action-1")?.label, "Agency accountability");
    assert.equal(metadata.get("action:action-1")?.assignmentSource, "manual");
  } finally {
    db.close();
  }
});

test("concept curation route merges concepts and clears assertion assignments", async () => {
  const db = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  const from = createAccountabilityConcept(db, { label: "Old theme" });
  const to = createAccountabilityConcept(db, { label: "New theme" });
  db.close();

  assert.equal((await post({ operation: "assign_assertion", conceptId: from.conceptId, assertionKind: "decision", assertionId: "decision-1" })).status, 200);
  const mergeResponse = await post({ operation: "merge", fromConceptId: from.conceptId, toConceptId: to.conceptId });
  assert.equal(mergeResponse.status, 200);

  const clearResponse = await post({ operation: "clear_assertion", assertionKind: "decision", assertionId: "decision-1" });
  assert.equal(clearResponse.status, 200);

  const verify = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  try {
    const metadata = loadAccountabilityConceptMetadataForAssertions(verify, [{ kind: "decision", assertionId: "decision-1" }]);
    assert.equal(metadata.has("decision:decision-1"), false);
  } finally {
    verify.close();
  }
});

test("concept curation route splits selected assertion assignments", async () => {
  const db = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  const source = createAccountabilityConcept(db, { label: "Broad theme" });
  db.close();

  assert.equal((await post({ operation: "assign_assertion", conceptId: source.conceptId, assertionKind: "action", assertionId: "action-split" })).status, 200);
  const splitResponse = await post({
    operation: "split",
    sourceConceptId: source.conceptId,
    concepts: [{ label: "Narrow theme", summary: "Focused subset", assertionIds: ["action-split"] }],
  });
  assert.equal(splitResponse.status, 200);

  const verify = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  try {
    const metadata = loadAccountabilityConceptMetadataForAssertions(verify, [{ kind: "action", assertionId: "action-split" }]);
    assert.equal(metadata.get("action:action-split")?.label, "Narrow theme");
  } finally {
    verify.close();
  }
});

test("concept curation route rejects invalid requests", async () => {
  const response = await post({ operation: "assign_assertion", assertionKind: "action", assertionId: "action-1" });
  assert.equal(response.status, 400);
  const payload = await response.json() as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /conceptId/u);

  const splitResponse = await post({ operation: "split", sourceConceptId: "concept-1", concepts: [{ label: "Empty split", assertionIds: [] }] });
  assert.equal(splitResponse.status, 400);
  const splitPayload = await splitResponse.json() as { ok: boolean; error: string };
  assert.equal(splitPayload.ok, false);
  assert.match(splitPayload.error, /assertionIds/u);
});

test("concept curation route rejects dormant graph assignment targets", async () => {
  const db = openMissionControlDb(path.join(stateDir, "mission-control.sqlite"));
  const dormant = createAccountabilityConcept(db, { label: "Dormant semantic group", status: "dormant" });
  db.close();

  const response = await post({ operation: "assign_assertion", conceptId: dormant.conceptId, assertionKind: "action", assertionId: "action-dormant" });
  assert.equal(response.status, 400);
  const payload = await response.json() as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /active concept/u);
});
