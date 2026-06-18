# Phase 3: Graph Concept Metadata And Toggle

## Goal

Extend the Accountability Graph model with concept metadata and add a non-disruptive concept overlay toggle. This phase prepares graph data for concept visualization without adding cluster-region geometry yet.

## Scope

Includes:

- Concept metadata in graph assertions.
- Concept stats in graph output.
- A `Concepts` overlay toggle in graph controls.
- Concept-aware node treatment when enabled.

Excludes:

- Cluster regions or hull rendering.
- Selecting concept regions.
- Concept curation controls.
- Automatic concept discovery.

## Implementation

Extend graph building:

- Add optional concept metadata to assertion graph nodes.
- Add graph-level concept stats derived from visible assertions.
- Preserve existing people, assertion, and link types.
- Do not create concept nodes in this phase.

Update graph view:

- Add a `Concepts` toggle next to existing graph visibility controls.
- When the toggle is off, graph rendering matches current behavior.
- When the toggle is on, assigned assertion nodes receive concept-aware visual treatment such as label text, color accent, or badge metadata.
- Keep action, decision, and done-action filters authoritative for assertion visibility.

## Public Interfaces

`AccountabilityGraphAssertionNode` gains optional concept metadata:

```ts
concept?: {
  id: string;
  label: string;
} | null;
```

`AccountabilityGraph.stats` gains:

```ts
concepts: number;
```

No mutation API changes.

## Acceptance Criteria

- Concept metadata does not alter existing people/assertion nodes or ownership links.
- Toggling concepts on or off does not change which assertions are visible.
- Existing graph tests pass with empty concept data.
- Assigned assertions expose concept metadata in graph output.
- Graph controls remain usable on desktop and mobile layouts.

## Test Plan

- Graph builder test verifies concept metadata appears on assigned assertion nodes.
- Graph builder test verifies empty concept data produces the existing node/link shape plus zero concept count.
- Graph view test verifies the concept toggle does not change action/decision visibility.
- Regression test verifies selecting person and assertion nodes still works.

## Dependencies

- Phase 1 concept metadata on `MyntItem`.
- Existing `buildAccountabilityGraph`, `AccountabilityGraphView`, and graph canvas rendering.
