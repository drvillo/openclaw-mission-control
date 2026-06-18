# Phase 4: Cluster Regions And Concept Selection

## Goal

Make Accountability Concepts visually useful in the graph by rendering optional cluster regions and adding a selected-concept detail overlay.

## Scope

Includes:

- Concept cluster regions around assigned assertion nodes.
- Concept selection from the graph.
- Concept detail overlay.
- Landscape and attention mode emphasis using the same concept identities.

Excludes:

- Manual concept curation.
- Automatic concept discovery.
- Workstream integration.

## Implementation

Render concept regions:

- When the `Concepts` toggle is enabled, group visible assigned assertion nodes by concept.
- Draw visual cluster regions around assigned assertion nodes for each concept.
- Keep people and assertion nodes selectable as they are today.
- Assertions without concepts remain visible outside concept regions.

Add concept selection:

- Support selecting a concept region.
- Add graph selection state for `{ type: "concept"; conceptId: string }`.
- Add selected-concept overlay with:
  - concept label
  - neutral summary
  - action count
  - decision count
  - involved people derived from visible owned, associated, and participant-context assertions
  - recent meetings
  - open actions
  - pending review count
  - representative assertions

Add mode behavior:

- Landscape mode emphasizes recent cross-meeting recurrence.
- Attention mode uses the same concept set but emphasizes open actions, pending review, and fragmented ownership.
- Mode changes ranking, styling, and summary emphasis only; it does not change assignments or concept identity.

## Public Interfaces

Graph view gains concept selection support.

Graph concept summary data should be derived from existing `MyntItem` fields and graph visibility state, not from a new API in this phase.

## Acceptance Criteria

- Concept regions are optional and do not replace graph nodes.
- Selecting a concept shows related visible assertions and derived people.
- Landscape and attention modes use the same concept set.
- Assertions without concepts remain visible when the concept overlay is enabled.
- Existing person/assertion selection overlays still work.
- Concept overlay content scrolls when lists are long.

## Test Plan

- Graph derivation test verifies selected-concept counts for actions, decisions, pending review, people, and meetings.
- Graph view test verifies concept selection renders the concept overlay.
- Mode test verifies landscape and attention modes use the same concept IDs.
- Regression test verifies person and assertion selection remain unchanged.
- Responsive layout test or component test verifies long concept details remain scrollable.

## Dependencies

- Phase 3 graph concept metadata and toggle.
- Existing selected-node overlay patterns in `AccountabilityGraphView`.
