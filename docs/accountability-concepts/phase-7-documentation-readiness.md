# Phase 7: Documentation And Readiness

## Goal

Document the implemented Accountability Concepts model and make the feature operationally understandable for future development and maintenance.

## Scope

Includes:

- Domain documentation.
- Developer operation notes.
- Backfill usage.
- Concept lifecycle explanation.
- Final regression expectations.

Excludes:

- New feature behavior beyond documentation and readiness checks.

## Implementation

Add documentation covering:

- Concepts versus workstreams.
- Concepts versus transcript topics.
- One-concept-per-assertion rule.
- Lifecycle states: active, dormant, discarded, merged.
- Landscape versus attention mode.
- Curation semantics for rename, summary update, merge, split, discard, and assignment.
- Backfill command usage and expected output.
- How to inspect concept results in the UI.

Add developer notes covering:

- Relevant tables and helper functions.
- How concept metadata flows into `MyntItem`.
- How concept metadata flows into the graph.
- How to run focused tests.
- Known limitations and future expansion points.

Run readiness checks:

- DB tests for concept persistence.
- Web tests for assertion UI and graph behavior.
- Worker/backfill tests for concept proposal.
- Existing accountability graph and assertion review regression tests.

## Public Interfaces

No new runtime interfaces in this phase. Documentation should reflect the interfaces introduced in earlier phases.

## Acceptance Criteria

- Documentation explains that Accountability Concepts are semantic overlays on actions and decisions.
- Documentation explicitly states that workstreams remain separate.
- Documentation explains that transcript content is evidence/background context, not a standalone concept source.
- Documentation explains lifecycle states and one-concept-per-assertion behavior.
- Documentation explains landscape and attention mode.
- A developer can run backfill and inspect concept results from the docs.
- Full relevant DB, web, and worker tests pass.

## Test Plan

- Run the full focused concept test set from phases 1 through 6.
- Run existing accountability graph tests.
- Run existing assertion card/register tests.
- Run existing meeting ingestion tests if backfill shares ingestion data paths.
- Manually inspect generated docs for stale file names, commands, or behavior claims.

## Dependencies

- Phases 1 through 6 complete.
- Final implementation command names and API route names are known.
