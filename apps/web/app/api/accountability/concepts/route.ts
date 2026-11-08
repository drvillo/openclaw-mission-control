import {
  assignAssertionConcept,
  clearAssertionConcept,
  createAccountabilityConcept,
  discardAccountabilityConcept,
  getAccountabilityConcept,
  listAccountabilityConcepts,
  mergeAccountabilityConcepts,
  openMissionControlDb,
  splitAccountabilityConcept,
  updateAccountabilityConcept,
} from "@ocmc/db";
import { NextResponse } from "next/server";
import { MISSION_CONTROL_DB_PATH } from "../../../lib/config";

export const runtime = "nodejs";

type ConceptOperation =
  | "create"
  | "rename"
  | "update_summary"
  | "discard"
  | "merge"
  | "split"
  | "assign_assertion"
  | "clear_assertion";

type Body = Record<string, unknown> & { operation?: unknown };

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertionKind(value: unknown): "action" | "decision" | null {
  return value === "action" || value === "decision" ? value : null;
}

function parseOperation(value: unknown): ConceptOperation | null {
  return value === "create" ||
    value === "rename" ||
    value === "update_summary" ||
    value === "discard" ||
    value === "merge" ||
    value === "split" ||
    value === "assign_assertion" ||
    value === "clear_assertion"
    ? value
    : null;
}

function activeConceptOrError(db: ReturnType<typeof openMissionControlDb>, conceptId: string, label = "conceptId") {
  const concept = getAccountabilityConcept(db, conceptId);
  if (!concept) {
    return `${label} does not exist`;
  }
  if (concept.status !== "active") {
    return `${label} must reference an active concept`;
  }
  return null;
}

export async function GET() {
  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    return NextResponse.json({ ok: true, concepts: listAccountabilityConcepts(db, ["active", "dormant"]) });
  } finally {
    db.close();
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const operation = parseOperation(body.operation);
  if (!operation) {
    return NextResponse.json({ ok: false, error: "operation must be create, rename, update_summary, discard, merge, split, assign_assertion, or clear_assertion" }, { status: 400 });
  }

  const db = openMissionControlDb(MISSION_CONTROL_DB_PATH);
  try {
    if (operation === "create") {
      const label = stringValue(body.label);
      if (!label) {
        return NextResponse.json({ ok: false, error: "label is required" }, { status: 400 });
      }
      const concept = createAccountabilityConcept(db, { label, summary: stringValue(body.summary) });
      return NextResponse.json({ ok: true, summary: `Created concept ${concept.label}.`, payload: { concept } });
    }

    if (operation === "rename") {
      const conceptId = stringValue(body.conceptId);
      const label = stringValue(body.label);
      if (!conceptId || !label) {
        return NextResponse.json({ ok: false, error: "conceptId and label are required" }, { status: 400 });
      }
      const concept = updateAccountabilityConcept(db, { conceptId, label });
      return NextResponse.json({ ok: true, summary: `Renamed concept to ${concept.label}.`, payload: { concept } });
    }

    if (operation === "update_summary") {
      const conceptId = stringValue(body.conceptId);
      if (!conceptId) {
        return NextResponse.json({ ok: false, error: "conceptId is required" }, { status: 400 });
      }
      const concept = updateAccountabilityConcept(db, { conceptId, summary: stringValue(body.summary) });
      return NextResponse.json({ ok: true, summary: `Updated ${concept.label}.`, payload: { concept } });
    }

    if (operation === "discard") {
      const conceptId = stringValue(body.conceptId);
      if (!conceptId) {
        return NextResponse.json({ ok: false, error: "conceptId is required" }, { status: 400 });
      }
      const concept = discardAccountabilityConcept(db, conceptId);
      return NextResponse.json({ ok: true, summary: `Discarded ${concept.label}.`, payload: { concept } });
    }

    if (operation === "merge") {
      const fromConceptId = stringValue(body.fromConceptId);
      const toConceptId = stringValue(body.toConceptId);
      if (!fromConceptId || !toConceptId || fromConceptId === toConceptId) {
        return NextResponse.json({ ok: false, error: "fromConceptId and a different toConceptId are required" }, { status: 400 });
      }
      const fromError = activeConceptOrError(db, fromConceptId, "fromConceptId");
      const toError = activeConceptOrError(db, toConceptId, "toConceptId");
      if (fromError || toError) {
        return NextResponse.json({ ok: false, error: fromError ?? toError }, { status: 400 });
      }
      const result = mergeAccountabilityConcepts(db, { fromConceptId, toConceptId });
      return NextResponse.json({ ok: true, summary: `Merged ${result.movedAssignments} assignment${result.movedAssignments === 1 ? "" : "s"}.`, payload: result });
    }

    if (operation === "split") {
      const sourceConceptId = stringValue(body.sourceConceptId);
      const concepts = Array.isArray(body.concepts)
        ? body.concepts.map((concept) => {
            const value = concept as Record<string, unknown>;
            return {
              label: stringValue(value.label),
              summary: stringValue(value.summary),
              assertionIds: Array.isArray(value.assertionIds) ? value.assertionIds.map(String) : [],
            };
          }).filter((concept) => concept.label && concept.assertionIds.length > 0)
        : [];
      if (!sourceConceptId || concepts.length === 0) {
        return NextResponse.json({ ok: false, error: "sourceConceptId and at least one split concept with assertionIds are required" }, { status: 400 });
      }
      const result = splitAccountabilityConcept(db, { sourceConceptId, concepts });
      return NextResponse.json({ ok: true, summary: `Created ${result.created.length} split concept${result.created.length === 1 ? "" : "s"}.`, payload: result });
    }

    if (operation === "assign_assertion") {
      const conceptId = stringValue(body.conceptId);
      const kind = assertionKind(body.assertionKind);
      const assertionId = stringValue(body.assertionId);
      if (!conceptId || !kind || !assertionId) {
        return NextResponse.json({ ok: false, error: "conceptId, assertionKind, and assertionId are required" }, { status: 400 });
      }
      const conceptError = activeConceptOrError(db, conceptId);
      if (conceptError) {
        return NextResponse.json({ ok: false, error: conceptError }, { status: 400 });
      }
      const assignment = assignAssertionConcept(db, { conceptId, assertionKind: kind, assertionId, source: "manual", confidence: null });
      return NextResponse.json({ ok: true, summary: "Assigned assertion concept.", payload: { assignment } });
    }

    const kind = assertionKind(body.assertionKind);
    const assertionId = stringValue(body.assertionId);
    if (!kind || !assertionId) {
      return NextResponse.json({ ok: false, error: "assertionKind and assertionId are required" }, { status: 400 });
    }
    const result = clearAssertionConcept(db, kind, assertionId);
    return NextResponse.json({ ok: true, summary: result.cleared === 1 ? "Cleared assertion concept." : "No concept assignment was cleared.", payload: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.close();
  }
}
