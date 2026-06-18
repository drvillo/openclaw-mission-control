# Phase 6: Concept Proposal And Backfill

## Goal

Add an assertion-first discovery and backfill path that proposes and assigns high-signal Accountability Concepts from existing actions and decisions.

## Scope

Includes:

- Backfill command for concept proposals.
- Idempotent concept creation and assignment.
- Recurrence-based ranking.
- Suppression of discarded concepts.
- Auto assignment confidence.

Excludes:

- Transcript-only concept creation.
- Mandatory curation review queue.
- Attempting to label every assertion.

## Implementation

Add a worker or maintenance command for concept backfill.

Input evidence:

- Assertion summary.
- Assertion kind.
- Owner.
- Meeting title and date.
- Evidence text and timestamp where present.
- Linked assertion associations.

Discovery rules:

- Concepts are created from assertions plus evidence context.
- Transcript text may be used only where it is linked as evidence or immediate evidence context.
- Transcript-only recurring topics do not create concepts.
- Candidate concepts rank higher when they recur across meetings and have multiple assertions.
- Keep approximately 10 active concepts by default.
- Leave routine or weak matches unlabeled.
- Suppress candidate concepts substantially similar to discarded concepts.
- Store automatic assignments with confidence.

Idempotency rules:

- Running backfill repeatedly should not duplicate concepts.
- Running backfill repeatedly should not create duplicate assignments.
- Existing manual concept-level curation must constrain future discovery.

## Public Interfaces

Add a non-interactive command such as:

```sh
pnpm --filter worker backfill-accountability-concepts
```

The exact command should follow existing worker command conventions.

Backfill result should report:

- concepts proposed
- concepts created
- assignments created
- assignments updated
- discarded candidates suppressed
- assertions left unlabeled

## Acceptance Criteria

- Backfill can run repeatedly without duplicating concepts or assignments.
- Proposed concepts are based only on assertions plus evidence context.
- Recurring assertion themes across meetings are more likely to become active concepts.
- Transcript-only themes do not create concepts.
- Discarded concept suppression works.
- Routine or weak matches remain unlabeled.
- Backfill reports a concise summary.

## Test Plan

- Idempotency test runs backfill twice and verifies stable concept and assignment counts.
- Assertion-first test verifies concepts are created from assertion summaries and evidence.
- Transcript-only exclusion test verifies transcript discussion without assertions does not create concepts.
- Recurrence ranking test verifies cross-meeting recurring assertions outrank one-off assertions.
- Discard suppression test verifies similar discarded concepts are not recreated.
- High-signal-only test verifies weak or routine assertions remain unlabeled.

## Dependencies

- Phase 1 persistence.
- Phase 5 durable curation semantics.
- Existing worker command structure and meeting ingestion data.
