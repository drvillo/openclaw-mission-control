# Phase 5: Manual Curation

## Goal

Add leader-owned curation controls for concept lifecycle and assertion assignment while keeping labels and summaries team-readable.

## Scope

Includes:

- Concept rename and summary update.
- Concept discard.
- Concept merge.
- Concept split with suggested reassignment review.
- Manual assertion assignment and clearing.
- Event logging for all curation operations.

Excludes:

- Automatic concept proposal.
- Bulk model-driven reassignment after split.
- Private leadership notes.

## Implementation

Add API actions for:

- Rename concept.
- Update concept summary.
- Discard concept.
- Merge concept into another concept.
- Split concept into new concepts and present suggested assertion reassignment.
- Manually assign or clear an assertion concept.

Add graph-overlay controls:

- Put concept-level curation controls in the selected-concept overlay.
- Keep controls secondary to the summary and assertion context.
- Confirm destructive operations such as discard and merge.

Persist curation:

- Record every curation operation in `accountability_concept_events`.
- Make concept-level curation durable.
- Treat manual assertion assignment as a strong hint for future discovery, not as a locked override.

## Public Interfaces

New concept curation endpoints or action routes should accept explicit operation payloads and return concise summaries compatible with existing mutation UI patterns.

Expected operations:

```ts
type ConceptCurationOperation =
  | "rename"
  | "update_summary"
  | "discard"
  | "merge"
  | "split"
  | "assign_assertion"
  | "clear_assertion";
```

Existing assertion review, reassign, and mark-done endpoints remain unchanged.

## Acceptance Criteria

- Renaming and summary edits update concept labels everywhere after refresh.
- Merging moves historical assignments to the surviving concept.
- Discarded concepts disappear from active concept results.
- Manual assertion assignment changes appear on assertion cards and graph after refresh.
- All curation operations write events.
- Split flow produces new concept records and a reviewable reassignment proposal.

## Test Plan

- API validation tests cover missing IDs, invalid operation names, and invalid merge targets.
- Merge test verifies assignment movement and merged lifecycle state.
- Discard test verifies active concept queries exclude discarded concepts.
- Assignment test verifies one-concept-per-assertion behavior is preserved.
- Event logging test verifies each curation operation writes an event payload.
- UI tests cover rename, discard confirmation, merge confirmation, and manual assignment refresh behavior.

## Dependencies

- Phase 1 DB helpers and events.
- Phase 4 selected-concept overlay.
