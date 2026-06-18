# Accountability Concepts Plan

## Purpose

Accountability Concepts are a semantic layer over the existing Accountability Map. They group recurring accountability themes found in actions and decisions, while keeping the map centered on accountable work.

Concepts are distinct from workstreams. Workstreams describe how the team organizes work. Accountability Concepts describe recurring semantic patterns that may cut across workstreams, meetings, and owners.

## Domain Decisions

- Concepts are semantic overlays on actions and decisions only.
- Transcript content is evidence and background context, not an independent concept source.
- Each assertion can have at most one concept.
- Assertions without concepts remain visible normally.
- Concepts are leader-curated and team-readable.
- Concept labels and summaries use neutral shared language.
- Concepts are high-signal only; the system should not force every assertion into a concept.
- Landscape and attention modes use the same concept identities.
- Manual concept-level curation persists and shapes future discovery.

## Phase Order

Start with the [Product Requirements Document](./PRD.md) for product intent, domain boundaries, and user experience goals.

1. [Persistent Concept Model](./phase-1-persistent-concept-model.md)
2. [Assertion UI Labels](./phase-2-assertion-ui-labels.md)
3. [Graph Concept Metadata And Toggle](./phase-3-graph-concept-metadata-toggle.md)
4. [Cluster Regions And Concept Selection](./phase-4-cluster-regions-selection.md)
5. [Manual Curation](./phase-5-manual-curation.md)
6. [Concept Proposal And Backfill](./phase-6-concept-proposal-backfill.md)
7. [Documentation And Readiness](./phase-7-documentation-readiness.md)

Each phase must meet its acceptance criteria before the next phase starts. The implementation should preserve existing review, reassign, mark-done, filtering, and graph behavior unless a phase explicitly changes that behavior.

## Shared Acceptance Principles

- Empty concept data must be safe in every phase.
- Existing accountability views remain useful without enabling concepts.
- Concepts add context; they do not replace actions, decisions, people, or ownership links.
- UI changes must not hide assertions or change mutation semantics.
- Tests should be focused enough for each phase to be implemented and verified independently.
