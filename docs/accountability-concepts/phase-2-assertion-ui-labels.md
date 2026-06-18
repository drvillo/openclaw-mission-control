# Phase 2: Assertion UI Labels

## Goal

Render assigned Accountability Concepts in existing assertion surfaces without changing graph behavior, filtering, or mutation flows.

## Scope

Includes:

- Read-only concept labels on assertion cards.
- Read-only concept labels in action and decision register/list rows.
- Styling for neutral team-readable labels.

Excludes:

- Concept filtering.
- Concept editing.
- Graph overlay behavior.
- Automatic concept assignment.

## Implementation

Update assertion UI surfaces:

- Add a compact concept label to `AssertionCard` when `item.concept` is present and active.
- Add the same label to assertion register rows where row metadata is shown.
- Use subdued styling consistent with existing badges and status labels.
- Keep concept labels read-only in this phase.

Rendering rules:

- Show concept labels only when an assertion has assigned concept metadata.
- Do not show discarded or merged concepts as active labels unless the loading layer resolves merged concepts to the survivor.
- Do not change row sorting, filtering, selection, or mutation behavior.

## Public Interfaces

No new API endpoints.

UI consumes `MyntItem.concept` from Phase 1.

## Acceptance Criteria

- Assertions with active concepts show a concept label consistently in cards and register/list views.
- Assertions without concepts render exactly as before.
- Existing approve, reject, reassign, and mark-done controls still work.
- Concept labels do not affect row selection, filtering, or graph mode entry.
- UI remains readable on mobile and desktop widths.

## Test Plan

- Assertion card test renders a concept label when `item.concept` exists.
- Assertion card test confirms no label appears when `item.concept` is absent.
- Register/list test renders concept metadata for rows with assigned concepts.
- Regression tests cover existing review/reassign/mark-done controls on concept-labeled assertions.

## Dependencies

- Phase 1 concept metadata on `MyntItem`.
- Existing `AssertionCard` and assertion register rendering paths.
