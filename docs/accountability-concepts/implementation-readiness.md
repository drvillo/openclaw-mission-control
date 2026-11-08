# Accountability Concepts Implementation Readiness

Accountability Concepts are implemented as a semantic overlay on accountability actions and decisions. They remain separate from workstreams: workstreams describe team organization, while concepts describe recurring accountability themes that can cut across meetings, owners, and workstreams.

## Domain model

Concepts are assertion-first. A concept can be assigned to an action or decision assertion; transcript text is only supporting evidence/background when attached to an assertion. Transcript-only recurring topics do not create concepts.

Each assertion can have at most one concept assignment. This is enforced by `UNIQUE(assertion_kind, assertion_id)` on `accountability_concept_assignments`.

Lifecycle states:

- `active`: visible and rendered as a concept label/graph overlay.
- `dormant`: retained, queryable, but not emphasized by default UI surfaces.
- `discarded`: excluded from active concept results and used by backfill suppression.
- `merged`: historical concept identity that points to `merged_into_concept_id`; loading resolves merged assignments to the surviving concept when possible.

## Persistence

Relevant tables live in `packages/db/src/sqlite.ts` and `packages/db/src/schema.ts`:

- `accountability_concepts`
- `accountability_concept_assignments`
- `accountability_concept_events`

Main helper functions:

- `createAccountabilityConcept`
- `listAccountabilityConcepts`
- `assignAssertionConcept`
- `clearAssertionConcept`
- `mergeAccountabilityConcepts`
- `splitAccountabilityConcept`
- `discardAccountabilityConcept`
- `loadAccountabilityConceptMetadataForAssertions`

All curation operations record concept events.

## UI flow

Concept metadata flows into `MyntItem.concept` through `apps/web/app/lib/mynt.ts`. Assertion cards and register rows render active concept labels only when metadata exists.

The Accountability Graph keeps its people/assertion nodes and ownership links. The optional `Concepts` overlay colors assigned assertion nodes, exposes concept stats, lists concept regions, and supports concept detail selection.

Landscape and attention modes use the same concept IDs and assignments:

- Landscape ranks recurring cross-meeting concept presence.
- Attention ranks open actions, pending review, and fragmented ownership.

## Curation

The concept API route is `GET /api/accountability/concepts` for active/dormant concept lookup and `POST /api/accountability/concepts` for curation writes.

Supported write operations:

- `create`: creates a leader-curated concept with a label and optional summary.
- `rename`: updates shared concept language without changing assignments.
- `update_summary`: updates the concept summary without changing assignments.
- `discard`: marks a concept as discarded so it is hidden from active concept results and similar future backfill candidates are suppressed.
- `merge`: marks the source concept as merged into the target concept and moves assignments to the surviving concept.
- `split`: creates one or more replacement concepts and reassigns explicitly provided assertions to them; it does not automatically infer split membership.
- `assign_assertion`: manually assigns one action or decision assertion to a concept. Because assignments are unique by `(assertion_kind, assertion_id)`, this replaces any previous concept assignment for that assertion.
- `clear_assertion`: removes the concept assignment from one action or decision assertion.

Graph concept detail panels expose rename, summary update, merge, discard, and manual assertion assignment/clearing controls. Destructive merge/discard operations are confirmed in the UI.

## Inspecting concept results

After running backfill or curation, inspect results in the web app:

1. Open the Accountability Map / graph view.
2. Enable the `Concepts` overlay control.
3. Use the landscape/attention mode control to switch ranking semantics while keeping the same concept identities and assignments.
4. Select a concept region or concept detail entry to review its label, summary, assigned assertions, owners, and curation controls.
5. Check assertion cards or the assertion register for inline concept labels on assigned actions and decisions.

Assertions with no concept assignment remain visible in the graph, cards, and register; concepts add context but do not replace the underlying action/decision records.

## Semantic proposal generation

Use the live semantic-layer API/UI path instead of a worker backfill command:

```http
POST /api/accountability/semantic/index
POST /api/accountability/semantic/proposal-runs/pull
```

`/semantic-concepts` exposes the same controls for operators. Proposal generation imports shadow proposals into review; product writes still require accept/merge/add-alias review actions.

## Focused checks

Useful checks while working on this feature:

```sh
# Concept persistence, curation helpers, and semantic proposal review behavior.
pnpm --filter @ocmc/worker exec tsx --test src/accountability-concepts.test.ts

# Full worker regression set, including meeting ingestion paths.
pnpm --filter @ocmc/worker test

# Concept API, Mynt metadata flow, graph overlay, and assertion UI labels.
pnpm --filter @ocmc/web exec vitest run \
  app/api/accountability/concepts/route.test.ts \
  app/lib/accountability-graph.test.ts \
  app/lib/mynt.test.ts \
  app/components/assertion-card.test.tsx \
  app/components/assertion-register.test.tsx

pnpm typecheck
pnpm build
```

## Known limitations

- Proposal generation uses the semantic-layer provider-backed proposal-run path; product writes still require review.
- Split support creates new concepts and can reassign explicitly provided assertion IDs; it does not perform model-driven bulk reassignment.
- Concept cluster rendering is intentionally restrained: concept regions are optional UI controls plus concept-aware assertion styling, not permanent concept nodes.
