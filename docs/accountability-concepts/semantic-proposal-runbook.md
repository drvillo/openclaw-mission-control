# Semantic Concept Proposal Runbook

Status: implemented semantic autopilot path  
Date: 2026-06-19

## Boundaries

- `@openclaw/semantic-layer` owns RAG recall, schema-bound synthesis, registry canonicalization, prompt/schema versions, and evaluation.
- Mission Control imports semantic proposal runs and owns review/product truth.
- Accepted and high-confidence auto-applied writes go through existing Accountability Concept helpers/events.
- The existing `meeting-assistant` -> Obsidian -> Mission Control ingestion path remains the source of curated notes. After successful Mission Control ingestion, the worker can run semantic refresh as an isolated post-ingestion hook; ingestion success is not rolled back if semantic refresh fails.
- Flags off disable semantic review APIs and the post-ingestion semantic hook; meeting ingestion remains unchanged.

## Semantic-layer flow

From `/Users/fonkey-oc/.openclaw/lib/semantic-layer`:

```sh
pnpm typecheck
pnpm test
semantic-layer extract --root "$OBSIDIAN_VAULT" --out extraction.jsonl "$OBSIDIAN_VAULT/Meeting Recordings/Fathom"
semantic-layer build-index --db semantic.sqlite --fixtures extraction.jsonl --openai-api-key "$OPENAI_API_KEY"
semantic-layer propose-semantic --fixtures extraction.jsonl --db semantic.sqlite --out semantic-proposal-run.json --openai-api-key "$OPENAI_API_KEY"
semantic-layer evaluate-semantic --fixtures extraction.jsonl --out semantic-evaluation.json --openai-api-key "$OPENAI_API_KEY"
```

Tests use local fake providers. Production proposal runs use explicit provider implementations such as `OpenAIEmbeddingProvider` and `OpenAIConceptSynthesisProvider`.

## Mission Control shadow import

Enable semantic review APIs only when needed:

```sh
export MISSION_CONTROL_SEMANTIC_CONCEPTS=1
```

Import a semantic proposal run:

```http
POST /api/accountability/semantic/proposal-runs/import
```

Body can be the proposal run JSON or `{ "proposalRun": <run> }`.

Inspect runs:

```http
GET /api/accountability/semantic/proposal-runs
GET /api/accountability/semantic/proposal-runs/:id
```

Pull/generate a semantic proposal run through the Mission Control adapter:

```http
POST /api/accountability/semantic/proposal-runs/pull
POST /api/accountability/semantic/proposal-runs        { "action": "pull" }
```

Body options are `{ "query": "optional focus", "reason": "mission_control_ui", "importIntoReview": true, "maxProposals": 12, "maxPackets": 8 }`. The adapter calls imported `@openclaw/semantic-layer` functions, resolves semantic candidate IDs to existing Mission Control assertion IDs where possible, annotates proposals with `applyReady` / `missingTargets`, and optionally imports the run into MC review state.

## UI path

With `MISSION_CONTROL_SEMANTIC_CONCEPTS=1`, `/semantic-concepts` is the semantic autopilot tuning console. It is status-first rather than a manual generator:

- **Runs/status** shows source bundle count, semantic DB/index readiness, provider readiness, latest refresh status, imported proposal counts, auto-applied counts, pending counts, and refresh errors.
- **Needs review** shows pending proposals with evidence counts, confidence, apply-readiness, linked assertion counts, and accept/merge/add-alias/reject/suppress controls.
- **Auto-applied** shows high-confidence concepts that were already written into Mission Control by the conservative autopilot. These are inspectable after the fact and the accepted concept label/summary can be corrected directly from the console.
- **Suppressed/rejected** keeps negative decisions visible. Reject is a one-run decision; suppress persists a normalized suppression so matching future suggestions are hidden from review by default and included in the semantic-layer registry snapshot as deprecated context.

Raw assertion/evidence/proposal IDs stay hidden in normal UI. The manual pull action remains available under an advanced disclosure as **Pull proposals into review**, but post-meeting ingestion plus semantic refresh is the primary product path.

## Review/apply APIs

```http
POST /api/accountability/semantic/proposals/:id/accept
POST /api/accountability/semantic/proposals/:id/reject
POST /api/accountability/semantic/proposals/:id/suppress  { "reason": "..." }
POST /api/accountability/semantic/proposals/:id/merge     { "targetConceptId": "..." }
POST /api/accountability/semantic/proposals/:id/add-alias { "targetConceptId": "...", "aliasesAccepted": ["..."] }
```

`accept` creates/maps the concept and assigns linked actions/decisions through existing MC helpers, but only after every linked action/decision ID resolves to an existing Mission Control assertion row. Pure semantic-layer candidate IDs remain shadow-only until an adapter supplies MC assertion IDs. `merge` and `add-alias` record concept events and review state; alias persistence is event-backed until MC grows a first-class alias table.

`reject` and `suppress` are intentionally different:

- `reject` records that this proposal should not be applied from this run. It does not block a materially similar future suggestion.
- `suppress` records a normalized label in `semantic_concept_suppressions`; future imports of the same normalized label default to `suppressed`, and the runtime passes suppressions into the semantic-layer registry snapshot as deprecated entries so synthesis/canonicalization has explicit negative context.

Split support is real but deliberately scoped: the graph concept overlay lets an operator create a split concept and move selected visible assertions. It calls the same `/api/accountability/concepts` `split` operation used by the backend, creates real concept records/assignment changes, and records concept events. It does not expose raw assertion IDs in normal UI.

## Graph semantic groups

The Accountability Graph toggle is now **Semantic groups**. When enabled, the graph model includes concept nodes connected to accepted/auto-applied Mission Control action/decision assertion nodes by `semantic_group` edges. Group overlays summarize:

- source (`semantic_auto`, `manual`, or legacy auto),
- average assignment confidence when available,
- assertion/action/decision counts,
- pending-review count,
- involved people,
- recent meetings,
- representative assertions,
- curation controls for rename, summary update, merge, split, discard, and per-assertion concept reassignment.

If semantic groups are disabled, the graph falls back to the people/assertion graph and keeps concept groups out of the rendered node set.

## Failure recovery

Semantic refresh is failure-isolated from meeting ingestion. If provider/index/synthesis fails, meeting ingestion still succeeds and records the semantic failure in both `semantic_refresh_runs` and the ingestion run semantic columns. Recovery steps:

1. Open `/semantic-concepts` and inspect **Runs/status** for the latest refresh error.
2. Fix provider/index/source configuration and use **Build semantic index** if the index is missing or stale.
3. Re-run ingestion or use **Advanced: pull proposals now** only for a targeted operator retry.
4. Verify auto-applied counts and pending review counts in `/semantic-concepts`, then enable **Semantic groups** in the graph to inspect resulting Mission Control concept visibility.

## Proposal-run import

Semantic shadow import now happens through the live Mission Control semantic-layer API/UI path:

```http
POST /api/accountability/semantic/proposal-runs/pull
```

That endpoint builds a proposal run with the configured semantic-layer providers and imports proposals into review. The worker post-ingestion hook uses the same shared runtime, then auto-applies only high-confidence, apply-ready proposals as `semantic_auto`; ambiguous/unresolved/low-confidence proposals remain pending.

## Deprecation posture

- Semantic proposal generation through `@openclaw/semantic-layer` is the only active product path.
- MC lexical/worker backfill concept extraction is retired from active worker code.
- Saved proposal-run JSON import through `@ocmc/worker` has been removed to avoid a second stale ingestion path.
