# Phase 1: Persistent Concept Model

## Goal

Add the database and TypeScript model needed to store Accountability Concepts and one concept assignment per assertion. This phase provides persistence only; it does not add UI rendering, graph behavior, or automatic extraction.

## Scope

Includes:

- Concept lifecycle storage.
- One concept assignment per action or decision assertion.
- Curation event history.
- Web-facing concept metadata on loaded assertion items.

Excludes:

- Concept labels in UI.
- Graph concept overlays.
- Manual curation endpoints.
- Automatic concept discovery or backfill.

## Implementation

Add concept schema in `packages/db/src/sqlite.ts`:

- `accountability_concepts`
  - `concept_id TEXT PRIMARY KEY`
  - `label TEXT NOT NULL`
  - `summary TEXT NOT NULL DEFAULT ''`
  - `status TEXT NOT NULL`
  - `merged_into_concept_id TEXT`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`

- `accountability_concept_assignments`
  - `assignment_id TEXT PRIMARY KEY`
  - `concept_id TEXT NOT NULL`
  - `assertion_kind TEXT NOT NULL`
  - `assertion_id TEXT NOT NULL`
  - `source TEXT NOT NULL`
  - `confidence REAL`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
  - `UNIQUE(assertion_kind, assertion_id)`

- `accountability_concept_events`
  - `concept_event_id TEXT PRIMARY KEY`
  - `concept_id TEXT NOT NULL`
  - `event_type TEXT NOT NULL`
  - `payload_json TEXT NOT NULL`
  - `created_at TEXT NOT NULL`

Add DB helpers for:

- Creating concepts.
- Listing active, dormant, discarded, and merged concepts.
- Assigning or clearing a concept for one assertion.
- Merging one concept into another and moving assignments to the surviving concept.
- Recording concept events.

Extend web loading:

- Add optional `concept` metadata to `MyntItem`.
- Join concept assignment data into action and decision assertion loading.
- Preserve current behavior when no concept rows exist.

## Public Interfaces

`MyntItem` gains:

```ts
concept?: {
  id: string;
  label: string;
  summary: string;
  status: "active" | "dormant" | "discarded" | "merged";
  assignmentSource: "auto" | "manual";
  confidence: number | null;
} | null;
```

DB helper names should follow existing `packages/db/src/sqlite.ts` conventions and use stable IDs where the module already uses them.

## Acceptance Criteria

- Existing app behavior is unchanged when concept tables are empty.
- A single assertion cannot have more than one concept assignment.
- `MyntIndex` includes `item.concept` only when an assignment exists.
- Concept lifecycle states are queryable.
- Merge moves assignments from the merged concept to the surviving concept.
- Empty-state loading remains compatible with existing meeting and accountability views.

## Test Plan

- DB schema test verifies all concept tables and indexes are created.
- Assignment uniqueness test verifies duplicate assignment for the same assertion is rejected or replaced through the helper path.
- Mynt loading test verifies assigned concept metadata appears on action and decision items.
- Empty concept data test verifies existing Mynt loading output is unchanged apart from the optional field being absent or null.
- Merge test verifies historical assignments move to the surviving concept and an event is recorded.

## Dependencies

- Existing meeting ingestion and assertion tables.
- Existing Mynt loading path in `apps/web/app/lib/mynt.ts` and meeting loading helpers.
