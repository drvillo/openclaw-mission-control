# RAG + LLM Concept Layer Architecture

Status: implemented shadow/review path  
Date: 2026-06-18  
Supersedes: `semantic-layer-phased-plan.md` Phase 5+ and the heuristic Jaccard concept proposal path

## Decision

Continue the semantic-layer track, but pivot the concept engine.

Keep:

- `meeting-assistant` as the owner of meeting capture, transcript curation, and current action/decision extraction.
- Obsidian meeting notes as the durable human-readable source artifact.
- `@openclaw/semantic-layer` as the OpenClaw-owned platform package outside Mission Control.
- parsing, source refs, evidence handling, local indexing, and future retrieval/Q&A infrastructure.

Replace:

- heuristic Jaccard concept clustering as the product concept proposal mechanism.
- manually seeded golden concepts as the main operating model.
- old Mission Control semantic phases that assumed the heuristic proposal layer would become the source.

Target:

- vector/RAG is the recall layer that finds related actions, decisions, assertions, and evidence across meetings.
- an LLM is the judgment/synthesis layer that turns retrieved cross-meeting evidence into stable, high-level concepts.
- a concept registry is the canonicalization layer that keeps labels stable over time.
- Mission Control remains the product truth and curation layer.

## Current implementation status

### Done / reusable

- `@openclaw/semantic-layer` lives at `/Users/fonkey-oc/.openclaw/lib/semantic-layer`.
- It can parse curated Obsidian meeting notes.
- It can extract assertion candidates, evidence windows, and people/entities from the current meeting note format.
- It has a local SQLite + FTS5 store and requires explicit embedding providers for index/query paths.
- It has a CLI surface for parse/extract/build-index/query/status/propose/calibrate.
- It is outside Mission Control, which is the correct ownership boundary.

### Not fit for target purpose

- `src/concepts.ts` heuristic Jaccard clustering.
- `src/calibration.ts` as the primary concept-quality loop.
- Old fixture/golden concept approach.
- Old Phase 5-9 plan tasks.

### Implemented in this reset

- RAG evidence packet assembly over action/decision candidates, evidence windows, meeting refs, people, retrieval scores, and registry context.
- Schema-bound concept synthesis through an explicit provider abstraction, with test-local fakes and prompt/model metadata.
- Registry canonicalization and alias decisions (`map_existing`, `add_alias`, `propose_new`, `reject`).
- Deterministic evaluation harness over JSONL fixtures or bounded real note corpora.
- Mission Control semantic proposal-run pull/import APIs and accepted apply/reject/merge/add-alias review APIs behind `MISSION_CONTROL_SEMANTIC_CONCEPTS`.
- Proposal-run import is owned by the live semantic-layer API/UI path, not a worker JSON-file backfill command.
- Legacy Jaccard/lexical paths are retired from active Mission Control worker code and must not be used as semantic product defaults.

## Core business processes

### 1. Meeting capture and curation

Owner: `meeting-assistant`

Responsibilities:

- receive Fathom/meeting source payloads
- normalize raw transcript and metadata
- produce curated Obsidian note
- preserve existing action/decision extraction output
- preserve evidence/provenance already in the note

Non-responsibilities:

- stable cross-meeting concept registry
- Mission Control product state
- semantic index lifecycle

### 2. Semantic ingestion and indexing

Owner: `@openclaw/semantic-layer`

Responsibilities:

- read curated Obsidian meeting notes
- parse meeting metadata, participants, transcript sections, action sections, decision sections, and evidence snippets
- normalize source references and content hashes
- index action/decision/evidence records for retrieval
- embed semantically useful units: actions, decisions, evidence windows, concept records, and registry definitions
- expose local CLI/library contracts for MC and calibration

Non-responsibilities:

- MC product truth
- concept lifecycle decisions such as accepted/merged/discarded
- meeting-assistant extraction behavior

### 3. Cross-meeting concept synthesis

Owner: `@openclaw/semantic-layer`

Responsibilities:

- build candidate evidence packets using retrieval over actions, decisions, evidence windows, people, project/client labels, and existing registry concepts
- ask an LLM to synthesize concept candidates from evidence packets using a strict schema
- require each concept candidate to cite supporting action/decision/evidence IDs
- reject concepts that are too narrow, routine, generic, or unsupported
- classify scope: personal, team, company, project, client/vendor, security/compliance, operational/process, strategic/commercial
- return structured proposal runs, not product truth

Non-responsibilities:

- auto-creating MC concepts
- overwriting existing MC curation

### 4. Concept registry and canonicalization

Owner: shared semantic layer for proposal logic; MC for accepted product state

Responsibilities in semantic layer:

- maintain/query a local concept registry candidate view
- compare new concepts against existing canonical concepts and aliases
- output one of: map_existing, add_alias, propose_new, reject

Responsibilities in MC:

- persist accepted canonical concepts
- expose curation controls
- track lifecycle/events/assignments
- decide whether semantic proposals become product truth

### 5. Mission Control product integration

Owner: Mission Control

Responsibilities:

- provide product API primitives to list semantic proposal runs, inspect evidence packets, accept/reject/merge concepts, and view concept-linked actions/decisions
- keep its own DB as product truth
- keep existing ingestion functioning while semantic concept integration is added
- do not change `meeting-assistant` -> Obsidian -> Mission Control ingestion for this integration; semantic proposal pulls are an additive adapter path over already-curated source artifacts
- use semantic layer as an external OpenClaw platform package/client, not as MC-owned implementation

Non-responsibilities:

- generic semantic extraction, embeddings, retrieval internals, or LLM concept synthesis internals

## End-to-end target flow

```text
Fathom / meeting source
  -> meeting-assistant
       - capture/transcript normalization
       - current action + decision extraction
       - curated Obsidian note write
  -> Obsidian meeting note
       - human-readable durable artifact
       - current MC ingestion continues
       - semantic layer consumes as source
  -> @openclaw/semantic-layer ingest
       - parse notes
       - normalize source refs
       - extract/load actions, decisions, evidence, people
       - build/update retrieval index
  -> RAG recall
       - retrieve similar actions/decisions/evidence across meetings
       - retrieve existing registry concepts and aliases
       - assemble evidence packets
  -> LLM concept synthesis
       - produce stable high-level concepts with citations
       - map to existing concept registry where possible
       - propose new concepts only when durable/useful
  -> semantic proposal run
       - JSON/SQLite/local store
       - no MC product writes yet
  -> Mission Control semantic adapter
       - shadow compare
       - review proposal run
       - accept/reject/merge concepts
       - persist accepted product state via MC helpers/events
  -> Mission Control UI/API
       - concepts linked to actions/decisions/evidence
       - better sense-making and future Q&A
```

## MC interface changes

### New semantic-layer output contracts

`SemanticEvidencePacket`

- packet_id
- query/seed/source reason
- included_action_ids
- included_decision_ids
- evidence_window_ids
- meeting_ids / note refs
- people/entity refs
- retrieval scores
- generated_at
- index_version

`SemanticConceptProposal`

- proposal_id
- proposal_run_id
- canonical_label_suggestion
- definition
- why_it_matters
- scope
- confidence
- registry_action: map_existing | add_alias | propose_new | reject
- existing_concept_id, if mapped
- aliases_suggested
- linked_action_ids
- linked_decision_ids
- linked_evidence_window_ids
- supporting_quotes
- rejection_reason, if rejected
- llm_model/provider/prompt_version
- retrieval/index versions

`SemanticConceptProposalRun`

- proposal_run_id
- source_window: meetings/date range/filter
- index_version
- registry_snapshot_version
- prompt_version
- generated_at
- proposals[]
- diagnostics[]

### MC API/product primitives

Initial shadow/review APIs should be additive and feature-flagged:

- `GET /api/accountability/semantic/proposal-runs`
- `GET /api/accountability/semantic/proposal-runs/:id`
- `POST /api/accountability/semantic/proposal-runs/import`
- `POST /api/accountability/semantic/proposals/:id/accept`
- `POST /api/accountability/semantic/proposals/:id/reject`
- `POST /api/accountability/semantic/proposals/:id/merge`
- `POST /api/accountability/semantic/proposals/:id/add-alias`

Accepted writes must go through existing MC concept helpers/events, not direct ad hoc writes.

## SRP / DRY rules

- `meeting-assistant` extracts meeting-level actions/decisions and writes the note once.
- `semantic-layer` consumes those outputs and performs retrieval/concept synthesis once.
- MC consumes semantic outputs and owns curation/product truth once.
- Do not duplicate action/decision extraction in semantic layer unless the semantic layer is explicitly comparing or augmenting existing output.
- Do not duplicate embeddings/retrieval inside MC.
- Do not duplicate product concept state in semantic layer.
- Do not let LLM prompts become hidden business logic in MC; prompt/schema versions belong to semantic layer.

## Recommended validation gate

Before MC product integration beyond shadow mode:

- Run on the last 10 real meetings and a larger historical sample.
- Concepts generated for at least 9/10 meetings.
- Median 3-6 concept candidates per meeting or batch.
- At least 70% judged useful/high-level by Francesco in under 10 minutes.
- Every concept has cited action/decision/evidence support.
- Duplicate/canonicalization behavior is acceptable: same concept is not renamed every meeting.
- Rejected concepts are mostly routine, narrow, or unsupported.

## What to delete later

Delete or quarantine after replacement tests exist:

- heuristic `generateConceptProposalRun` Jaccard clustering as product path
- old calibration sweep code as product calibration path
- tests/fixtures tied to the heuristic concept engine
- MC lexical concept backfill code once semantic concept path is accepted and stable

Do not delete:

- meeting-assistant action/decision extraction
- MC canonical concept/product tables
- MC curation helpers/events
- semantic parsing/indexing infrastructure that supports retrieval/Q&A
