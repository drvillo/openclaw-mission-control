# Accountability Concepts System Boundaries Memo

## TL;DR
Mission Control should own the **accountability-concepts product layer**: concept domain rules, curation workflows, graph/UI behavior, ranking semantics for landscape vs attention, and persistence of concept decisions tied to accountability assertions.

Mission Control should **not** become the general home for embeddings, vector search, transcript chunk infrastructure, retrieval orchestration, provider abstraction, or calibration tooling. Those are better treated as reusable OpenClaw platform capabilities with explicit contracts into Mission Control.

Recommended split:

- **Mission Control owns**: accountability concept model, curation state, concept-to-assertion assignment rules, graph derivation, product APIs, feature-specific backfill orchestration.
- **Shared OpenClaw platform owns**: transcript chunk storage/indexing primitives, embedding generation, vector/RAG retrieval services, model/provider abstraction, evaluation/calibration infrastructure.
- **Integration contract**: Mission Control passes assertion/evidence/transcript references into shared services and receives scored candidates, neighbors, clusters, summaries, and/or retrieval hits back as inputs to MC-specific decision logic.

## Why this boundary matters
The current implementation is intentionally assertion-first and product-specific. That is good. But if future concept discovery evolves toward semantic retrieval, clustering, embedding-based recurrence detection, or evidence-grounded summarization, those capabilities will likely be useful beyond Mission Control.

If Mission Control directly owns chunking, embedding jobs, vector schemas, provider adapters, and evaluation harnesses, it becomes a monolith and duplicates platform concerns that OpenClaw will likely need elsewhere.

The better architecture is:

1. Keep **accountability semantics** inside Mission Control.
2. Push **general semantic infrastructure** into shared OpenClaw systems.
3. Connect them through narrow, testable contracts.

---

## 1. What Mission Control should encapsulate

Mission Control should remain the source of truth for everything that is specific to the Accountability Concepts product.

### 1.1 Domain model and invariants
Mission Control should own:

- `accountability_concepts`
- `accountability_concept_assignments`
- `accountability_concept_events`
- one-concept-per-assertion rule
- lifecycle states: `active`, `dormant`, `discarded`, `merged`
- merge/split/discard semantics
- manual assignment and clearing semantics
- suppression behavior for discarded concepts

These are not generic semantic-search concerns. They are product/domain rules.

### 1.2 Product interpretation rules
Mission Control should own the rules that define what a concept *is*:

- concepts are assertion-first
- actions and decisions are valid concept sources
- transcript-only themes do not create concepts
- evidence text is supporting context only when tied to assertions
- concept labels/summaries must remain neutral and team-readable
- not every assertion needs a concept

This logic is specific to accountability sensemaking, not reusable platform retrieval.

### 1.3 UI and workflow behavior
Mission Control should own:

- inline concept labels on assertion cards/register rows
- graph overlay toggle
- concept cluster/region rendering
- concept detail panel behavior
- landscape vs attention ranking semantics
- curation UX and confirmations
- concept inspection flows after backfill

These belong squarely in the MC product surface.

### 1.4 Product API surface
Mission Control should expose and own product-facing endpoints like:

- `GET /api/accountability/concepts`
- `POST /api/accountability/concepts`
- graph/data loaders that enrich assertions with concept metadata
- semantic review API/UI entrypoints such as `/api/accountability/semantic/proposal-runs/pull` and `/semantic-concepts`

These APIs may call shared services internally, but the product contract remains MC-owned.

### 1.5 Orchestration of feature-specific backfill
Mission Control should own the backfill orchestration that translates accountability data into candidate concepts:

- which assertions are eligible
- which evidence is included
- which concepts are suppressible
- thresholds for concept creation
- how results become assignments vs suggestions
- idempotency rules and event logging

Even if semantic scoring comes from a shared service, the final decision policy should stay inside MC.

---

## 2. What should be separate reusable OpenClaw systems

The following capabilities should be platformized rather than embedded inside Mission Control.

### 2.1 Embedding service
A shared embedding capability should own:

- provider/model abstraction for embeddings
- batching and retries
- versioned embedding metadata
- re-embedding workflows when models change
- caching and deduplication by content hash

Mission Control should not care whether embeddings come from OpenAI, local models, or another backend. It should consume embedding outputs through a stable interface.

### 2.2 Vector / RAG store
A reusable retrieval substrate should own:

- vector index storage
- lexical/vector/hybrid retrieval primitives
- chunk-to-document relationships
- metadata filtering
- nearest-neighbor lookup
- cluster candidate lookup
- collection lifecycle and reindexing

This should be usable by other OpenClaw products beyond Mission Control.

### 2.3 Transcript chunk store
Mission Control currently persists transcript segments and evidence links in its DB because they are directly tied to the meeting/accountability ingestion model. That is fine for the product record.

But if semantic workflows require chunking strategies beyond line/segment storage, a shared subsystem should own:

- chunking policies
- normalized chunk objects
- chunk hashes
- chunk-to-source references
- indexing-ready payloads
- retrieval-time snippet reconstruction

Recommended distinction:

- **MC keeps canonical meeting/transcript/evidence records needed for accountability workflows**.
- **Platform may maintain a derived semantic chunk index built from those records**.

### 2.4 Retrieval API
A shared retrieval API should own generic operations such as:

- retrieve similar assertions
- retrieve similar evidence snippets
- retrieve semantically related transcript chunks
- hybrid search over linked evidence
- retrieve cluster seeds/candidate neighborhoods

Mission Control should ask for retrieval results; it should not own generic retrieval machinery.

### 2.5 Provider abstraction
Any LLM/provider-specific logic for:

- embeddings
- summarization
- clustering assistance
- candidate label generation
- confidence calibration assistance

should be centralized in shared OpenClaw abstractions. Mission Control should not accumulate direct provider-specific code paths.

### 2.6 Calibration / evaluation tooling
A reusable evaluation layer should own:

- benchmark datasets
- precision/recall tracking
- threshold tuning workflows
- regression suites for semantic retrieval quality
- human-review calibration loops
- model comparison reports

Mission Control should define feature-specific success metrics, but the tooling should be reusable.

---

## 3. Recommended ownership boundaries

## 3.1 Mission Control ownership
**Team:** Mission Control / product-facing accountability team

**Owns:**

- domain schema for meetings, assertions, evidence links, concepts, assignments, concept events
- product APIs and UI
- concept curation semantics
- graph derivation and ranking semantics
- backfill orchestration and final write decisions
- feature-specific tests and readiness docs

**Primary question MC answers:**
> Given accountability assertions and evidence, what concept state should the product show and allow the leader to curate?

## 3.2 OpenClaw platform ownership
**Team:** shared platform / memory-retrieval-inference infrastructure

**Owns:**

- embedding pipelines
- vector storage/retrieval services
- generic transcript/doc chunk indexing patterns
- provider adapters
- semantic ranking and clustering primitives
- evaluation/calibration infrastructure
- reusable retrieval APIs and SDKs

**Primary question platform answers:**
> Given text/content plus metadata, how do we index, retrieve, compare, cluster, summarize, and evaluate semantic relationships reliably?

## 3.3 Joint boundary zone
Some areas are derived from MC data but should use shared machinery:

- evidence-snippet semantic retrieval
- assertion similarity search
- semantic candidate generation for backfill
- neutral label/summary suggestion generation
- confidence scoring support

In this zone, MC remains the policy owner; platform remains the capability owner.

---

## 4. Integration contracts

Mission Control should integrate with platform through narrow contracts rather than shared internal tables.

### 4.1 Indexing contract: MC -> platform
Mission Control publishes semantic indexing inputs, for example:

```ts
type SemanticAssertionDocument = {
  objectType: "action_assertion" | "decision_assertion";
  objectId: string;
  meetingId: string;
  documentVersionId: string;
  sourceDocumentId: string;
  summary: string;
  ownerRaw?: string | null;
  label: string;
  evidenceText?: string | null;
  evidenceTargetTime?: string | null;
  meetingTitle: string;
  meetingDate?: string | null;
  participantIdentityIds: string[];
  transcriptSegmentRefs: Array<{ transcriptSegmentId: string; timestamp: string }>;
  metadata: {
    reviewStatus?: string;
    status?: string | null;
  };
};
```

Contract requirements:

- MC owns object identity and eligibility.
- Platform treats MC IDs and metadata as opaque source references.
- Platform does not invent product semantics like `discarded` or `merged`.

### 4.2 Retrieval contract: MC <- platform
Platform returns retrieval results, not product decisions:

```ts
type RetrievalHit = {
  objectType: string;
  objectId: string;
  score: number;
  reasons?: string[];
  matchedText?: string | null;
  metadata?: Record<string, unknown>;
};
```

Mission Control then decides:

- whether the hit is in-bounds
- whether transcript context is allowable
- whether a candidate is high-signal enough
- whether a concept should be created, updated, or ignored

### 4.3 Candidate generation contract
If platform offers clustering/candidate generation, keep it advisory:

```ts
type ConceptCandidateProposal = {
  proposalId: string;
  labelSuggestion?: string;
  summarySuggestion?: string;
  memberAssertions: Array<{ assertionKind: "action" | "decision"; assertionId: string }>;
  recurrenceSignals: {
    assertionCount: number;
    meetingCount: number;
    participantCount: number;
    recentActivityScore?: number;
  };
  confidence: number;
  rationale?: string[];
};
```

Mission Control should still enforce:

- one-concept-per-assertion
- discard suppression
- merge/split compatibility
- high-signal thresholding
- idempotent writes

### 4.4 Summary/label generation contract
If label/summary generation uses LLMs, platform should expose a neutral generation contract, while MC owns prompts/policy constraints or at least validates outputs against them.

Minimum constraints MC should enforce before persisting:

- neutral tone
- team-readable language
- no transcript-only concepts
- no invented facts
- no leaking hidden/private metadata into shared concept summaries

---

## 5. Data boundary recommendations

## 5.1 What should stay in the MC database
Mission Control DB should remain the canonical store for:

- meetings
- participants
- transcript segments used by the accountability product record
- action/decision assertions
- evidence links
- assertion associations
- accountability concepts, assignments, and events

This preserves local product integrity and keeps accountability workflows self-contained.

## 5.2 What should be derived into shared stores
Shared platform stores may derive and manage:

- semantic chunks built from transcript/evidence/assertion text
- embeddings and embedding-version metadata
- retrieval indexes
- cluster caches
- evaluation artifacts

These should be rebuildable from MC canonical records plus stable source references.

### Key rule
**MC DB = source of product truth.**
**Shared semantic stores = rebuildable accelerators and inference support.**

That separation keeps product state durable while allowing retrieval infrastructure to evolve independently.

---

## 6. Workflow boundary recommendations

## 6.1 Ingestion workflow
Mission Control should continue to own:

- meeting note ingestion
- parsing meeting markdown
- assertions, participants, evidence links, associations
- accountability-specific normalization

After ingestion, MC can emit indexing jobs/events for shared semantic systems.

## 6.2 Backfill workflow
Recommended pipeline:

1. MC queries eligible assertions/evidence.
2. MC sends indexing or retrieval requests to shared semantic platform as needed.
3. Platform returns neighbors, clusters, or suggested labels.
4. MC applies accountability rules and curation constraints.
5. MC writes concepts/assignments/events.
6. MC UI exposes results and curation actions.

This keeps final product authority in MC.

## 6.3 Curation workflow
All curation writes should stay entirely in MC. Shared semantic systems may later consume those curation events as training/calibration signals, but they should not own the write path.

Example:

- MC discard event -> platform may use it as a negative example for future proposal ranking.
- MC merge event -> platform may remap future candidate clustering hints.
- MC manual assignment -> platform may treat as a positive example.

But the event source of truth remains MC.

---

## 7. Practical near-term architecture for Accountability Concepts

Given the current codebase, the pragmatic next step is **not** to move everything out of Mission Control immediately.

### Near-term
Use the semantic-layer proposal-run path outside MC for generation, and keep Mission Control focused on review/product truth:

- explicit providers
- local semantic index/store
- assertion-first evidence packets
- reviewed/idempotent product writes
- aligned with product semantics

### Add next, but as shared capability
If quality needs improve beyond keyword recurrence, introduce shared services in this order:

1. **Shared assertion/evidence indexing contract**
2. **Shared retrieval API for similar assertions/evidence**
3. **Shared embedding/provider abstraction**
4. **Shared evaluation/calibration harness**
5. Optional clustering/label suggestion service

This allows MC to use semantically assisted proposal generation without becoming the platform owner.

---

## 8. Risks if boundaries are ignored

If Mission Control owns too much platform infrastructure:

- provider logic fragments across products
- embedding/index schemas become product-coupled
- retrieval quality work cannot be reused elsewhere
- evaluation tooling gets duplicated
- semantic infrastructure changes require product refactors
- MC deploys become heavier and more brittle

If too much is pushed into platform too early:

- product semantics become vague
- concept rules drift away from accountability needs
- platform starts making product decisions it should not own
- iteration speed slows because every product change becomes infra work

So the right split is:

- **MC owns policy, semantics, persistence, UX**
- **Platform owns reusable semantic capability**

---

## 9. Recommended decision

### Recommendation
Treat Accountability Concepts as a **Mission Control product feature built on shared OpenClaw semantic infrastructure**, not as a standalone monolithic subsystem inside MC.

### Concretely
- Keep current concept tables, curation APIs, graph behavior, and worker entrypoints in MC.
- Keep meeting/assertion/evidence canonical records in MC.
- Do **not** add embedding providers, vector schemas, chunk pipelines, or retrieval engines directly into MC unless there is no shared platform path.
- Define explicit indexing/retrieval contracts around provider-backed local indexes.
- Use MC curation events as future training/calibration signals for shared semantic services.

## 10. Sources
- `docs/accountability-concepts/README.md`
- `docs/accountability-concepts/PRD.md`
- `docs/accountability-concepts/phase-3-graph-concept-metadata-toggle.md`
- `docs/accountability-concepts/phase-4-cluster-regions-selection.md`
- `docs/accountability-concepts/phase-7-documentation-readiness.md`
- `docs/accountability-concepts/implementation-readiness.md`
- `apps/worker/src/meetings-ingestion.ts`
- `apps/worker/src/index.ts`
- `apps/web/app/lib/meetings.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/sqlite.ts`
- OpenClaw docs on QMD/memory architecture: `docs/concepts/memory-qmd.md`

---

## Addendum: Transcript extraction and semantic indexing boundaries

### TL;DR
Today the pipeline is already mostly split as:

`Fathom -> meeting-assistant extraction/write -> Obsidian transcript note -> Mission Control ingestion -> MC DB`

That split is directionally right, but there is still architectural ambiguity around who should own:

- transcript extraction from raw meeting payloads
- transcript-note normalization
- semantic chunking/embedding/indexing
- downstream retrieval for assertions/concepts

Recommended decision:

- **meeting-assistant owns meeting-specific transcript capture + assertion extraction**
- **Obsidian is a canonical human-readable artifact layer, not the semantic system of record**
- **Mission Control owns ingestion of canonical meeting notes into accountability records and concept policy**
- **a shared semantic platform/service owns reusable chunking, embeddings, vector indexing, and retrieval**

So the single owner for **transcript extraction** should remain **meeting-assistant**.
The single owner for **semantic indexing** should be a **shared semantic platform/service**, not Mission Control and not duplicated inside meeting-assistant.

### 1. Current pipeline map

Current production flow, based on the existing Fathom pipeline:

1. **Fathom webhook or local replay enters meeting-assistant**
   - `process_webhook_file` / `process_meeting` in `src/meeting_assistant/fathom/pipeline.py`
   - if webhook payload is incomplete, meeting-assistant fetches the full meeting by `recording_id`

2. **meeting-assistant normalizes the raw meeting payload**
   - `normalize_fathom_meeting(...)`
   - derives participants, transcript lines, summary, action items, recording metadata

3. **meeting-assistant extracts assertions from transcript context**
   - `extract_findings(...)` produces actions + decisions
   - participant association inference enriches ownership/people references

4. **meeting-assistant writes the canonical Obsidian meeting note**
   - `upsert_meeting_note(...)` in `page_store.py`
   - note includes frontmatter, participants, summary, Fathom items, extracted actions, extracted decisions, full transcript, provenance
   - note path is stable per `recording_id`

5. **meeting-assistant rebuilds local Obsidian transcript indexes**
   - `rebuild_transcript_indexes(...)`
   - writes `Meeting Recordings/Fathom/Index.md` plus by-date/title/participant indexes

6. **meeting-assistant notifies Mission Control ingestion**
   - `notify_mission_control_ingestion(...)`
   - sends only `{ sourcePath }` for the canonical note

7. **Mission Control ingests the note into the MC database**
   - `apps/worker/src/meetings-ingestion.ts`
   - resolves and validates the note path under the Obsidian vault / Fathom recordings root
   - parses markdown into structured payload via `buildMeetingIngestionPayload(...)`
   - persists source document, meeting, extraction run, participants, transcript segments, action assertions, decision assertions, evidence links

8. **Mission Control derives accountability/product records from that ingestion**
   - assertions, evidence links, participant associations, and then accountability concepts/assignments/events

In short:

`Fathom -> meeting-assistant -> Obsidian note -> Mission Control ingestion -> MC meetings/assertions/evidence -> MC concepts`

### 2. Single-responsibility boundaries

#### 2.1 meeting-assistant
meeting-assistant should own:

- source-specific meeting capture from Fathom and similar meeting systems
- normalization of raw vendor payloads into a canonical meeting model
- transcript extraction from raw meeting payloads
- assertion extraction from transcripts (actions, decisions, ownership clues, evidence windows)
- production of the canonical meeting note artifact
- provenance for how that note was produced

meeting-assistant should **not** own:

- Mission Control’s product schema or accountability-concept rules
- global semantic indexing infrastructure
- long-term vector collections for general retrieval across products

Why: this component already has the source-specific logic and the transcript/assertion extraction context. Moving raw extraction into MC would duplicate Fathom-specific logic and violate SRP.

#### 2.2 Obsidian
Obsidian should own only the artifact role:

- durable human-readable meeting transcript note
- operator-editable context / manual notes
- stable path-based handoff boundary between capture and ingestion
- lightweight browsing indexes for humans

Obsidian should **not** be treated as:

- the semantic indexing engine
- the canonical machine database for accountability features
- the place where multiple systems independently re-extract the same transcript semantics

Why: Obsidian is the shared document artifact, not the intelligence layer.

#### 2.3 Mission Control DB
Mission Control should own:

- canonical accountability product records after note ingestion
- meetings, participants, transcript segments needed for product truth
- action assertions, decision assertions, evidence links, associations
- accountability concepts, assignments, curation events, graph semantics
- product APIs and decision policy around concepts

Mission Control should **not** own:

- vendor-specific transcript extraction from raw Fathom payloads
- duplicate extraction from already-processed notes unless explicitly for validation/migration
- generic embedding/index lifecycle for reusable semantic infrastructure

Why: MC is the accountability product boundary. It should ingest canonical artifacts, not become the raw meeting ETL system and not become the general vector platform.

#### 2.4 Shared semantic index / RAG service
A shared semantic platform/service should own:

- chunking policies for semantic retrieval
- embedding generation and versioning
- vector / lexical / hybrid retrieval indexes
- collection lifecycle, re-embedding, deduplication, and retrieval APIs
- cross-product semantic reuse beyond meetings

That service should treat MC and meeting-assistant as publishers/consumers of semantic documents, not as places to duplicate index logic.

Why: chunking/embedding/retrieval are generic infrastructure concerns. They violate DRY if reimplemented separately in meeting-assistant and Mission Control.

### 3. DRY recommendation: one owner for extraction, one owner for indexing

There should be **one owner for transcript extraction** and **one owner for semantic indexing**.

Recommended split:

- **Transcript extraction owner:** `meeting-assistant`
- **Semantic indexing owner:** shared `semantic platform / meeting-intelligence indexing service`

What should not happen:

- meeting-assistant extracts transcript structure and then Mission Control re-extracts transcript structure again from markdown
- meeting-assistant builds one embedding/chunk index while Mission Control builds a second one from the same note
- Obsidian indexes for humans become conflated with machine semantic indexes

Important nuance: MC may still parse the note into structured DB rows, because that is **ingestion into product truth**, not duplicate semantic extraction. The duplication to avoid is semantic/intelligence-layer re-processing of the same transcript in multiple systems.

### 4. Where extraction/indexing should live

#### Recommendation
- **Extraction should live in `meeting-assistant`.**
- **Semantic indexing should live in a shared semantic platform/service, not directly in Mission Control.**

#### Why not put extraction in Mission Control?
- MC currently ingests a canonical note, not raw Fathom APIs.
- Pulling extraction into MC would force MC to understand source-specific payload quirks, transcript normalization, and meeting-vendor retry/fetch logic.
- That would couple the accountability product to meeting-capture infrastructure and break SRP.

#### Why not leave indexing entirely inside meeting-assistant?
- Local transcript indexes in meeting-assistant are currently Obsidian browsing aids, not a reusable semantic substrate.
- If semantic retrieval matures, other consumers besides MC will likely want the same retrieval capability.
- Putting full vector/index infrastructure in meeting-assistant would turn a source adapter into a platform.

#### Why not put indexing directly in Mission Control?
- That would duplicate platform infrastructure already needed elsewhere.
- It would make MC responsible for embedding/versioning/reindex/provider concerns that are not accountability-specific.
- It would increase coupling between concept product logic and infrastructure evolution.

#### Best target shape
A good end-state is either:

1. **Shared meeting-intelligence service** if the semantic scope remains mostly meetings/transcripts, or
2. **OpenClaw semantic platform** if the same indexing/retrieval substrate will be shared across meetings, notes, docs, and broader agent memory.

Given the current direction, I’d recommend **OpenClaw semantic platform ownership with a meeting-intelligence collection/domain on top**, because that keeps the infrastructure generic while preserving meeting-specific contracts.

### 5. Integration contracts / events needed

Mission Control should not duplicate extraction/indexing. To avoid that, introduce explicit contracts.

#### 5.1 Capture artifact contract: meeting-assistant -> downstream
Canonical meeting artifact should provide:

- stable `recording_id`
- stable note path / canonical source path
- transcript text and timestamps
- participants
- extracted actions and decisions
- provenance (`run_id`, extractor, model, prompt hash, transcript hash)

This already largely exists in the note format and provenance block.

#### 5.2 Ingestion contract: meeting-assistant -> Mission Control
Current contract is effectively:

```json
{ "sourcePath": "Meeting Recordings/Fathom/...md" }
```

That is acceptable for product ingestion, but MC should continue to interpret this as:

- ingest canonical note
- persist product records
- do **not** re-run transcript/assertion extraction unless a special migration/repair mode is invoked

#### 5.3 Semantic publish contract: canonical meeting/assertions -> semantic platform
After canonical note write or after MC ingestion, a publisher should emit semantic indexing documents such as:

- transcript chunks with stable chunk IDs and source refs
- assertion documents with meeting/participant metadata
- evidence snippet documents linked to assertions

Minimum required fields:

- `sourceDocumentId` / `canonicalSourcePath`
- `meetingId`
- `recordingId`
- `documentVersionId` or transcript hash
- object type (`transcript_chunk`, `action_assertion`, `decision_assertion`, `evidence_snippet`)
- stable object ID
- text payload
- metadata for participants/date/source

#### 5.4 Retrieval contract: semantic platform -> Mission Control
MC should receive:

- similar assertions
- similar evidence snippets
- related transcript chunks
- cluster candidates / recurrence signals
- optional label/summary suggestions

MC should then apply product policy and concept rules itself.

#### 5.5 Events
Useful events/messages:

- `meeting_note_written`
- `meeting_note_ingested`
- `semantic_documents_published`
- `semantic_index_completed`
- `semantic_reindex_requested`
- `document_version_superseded`

These events keep systems loosely coupled and avoid hidden re-processing.

### 6. Migration path from current setup

#### Phase 1 — keep current flow, clarify ownership
Do now:

- declare `meeting-assistant` as the only transcript/assertion extraction owner
- declare MC ingestion as product persistence only
- declare current `rebuild_transcript_indexes(...)` outputs as human-browsing indexes, not semantic platform indexes

This is mostly a documentation/architecture decision.

#### Phase 2 — introduce semantic publishing without changing MC product logic
Next:

- emit semantic documents from either meeting-assistant after note write or MC after ingestion
- prefer MC as publisher for assertion/evidence documents because MC owns canonical product IDs
- prefer transcript-chunk publishing from the canonical ingested meeting document, not from ad hoc duplicate parsing elsewhere

This creates one semantic feed without changing concept logic.

#### Phase 3 — centralize embeddings/indexing in shared service
Then:

- move chunking/embedding/vector lifecycle into shared semantic infrastructure
- keep only human index pages in meeting-assistant/Obsidian
- keep only retrieval consumption + concept decisions in MC

#### Phase 4 — use semantic retrieval to assist Accountability Concepts
Finally:

- MC requests neighbors/clusters/proposals from the shared semantic service
- MC applies accountability rules and writes concepts/assignments/events
- no duplicate extraction/indexing pipelines are added inside MC

### 7. Practical decision

If forced to choose a single sentence architecture rule:

> **meeting-assistant extracts meetings, Mission Control ingests accountability records, and shared semantic infrastructure indexes meaning.**

That is the cleanest SRP/DRY boundary for the current system.

### 8. Stable Phase 3 semantic proposal-run boundary

For the current Mission Control semantic-concepts integration, keep the runtime boundary narrow and additive:

Mission Control consumes and persists:

- semantic proposal runs and their immutable run IDs
- proposal rows, review status, target concepts, and suppression state
- linked action assertion IDs, decision assertion IDs, and evidence-window IDs after MC target resolution
- raw run/proposal JSON, including provider audit payloads, dropped/skipped proposal diagnostics, parse diagnostics, prompt/schema metadata, and import diagnostics
- MC review decisions (`accept`, `reject`, `merge`, `add_alias`, `suppress`) as the source of truth for curation outcomes

The semantic layer owns:

- note parsing/extraction bundles used for semantic proposal generation
- chunking, indexing, embedding providers, retrieval scoring, packet construction, and packet caps
- synthesis provider prompts, strict output schema, confidence parsing, registry canonicalization, and proposal gating
- quality evaluation/calibration, including specificity, evidence alignment, packet coherence, duplicate/conflict risk, confidence bands, and review-feedback analysis

Auto-apply remains conservative: MC may auto-accept only proposals that are high-confidence, evidence-aligned, not suppressed, and have all linked action/decision targets resolved in MC. If the semantic layer suppresses every proposal, that is a safe failure mode; tune retrieval/evaluation before relaxing gates.

### Addendum sources
- `/Users/fonkey-oc/.openclaw/workspace-meeting-assistant/skills/fathom-action-sync/SKILL.md`
- `/Users/fonkey-oc/.openclaw/workspace-meeting-assistant/FATHOM-IMPROVEMENT-PLAN.md`
- `/Users/fonkey-oc/.openclaw/workspace-meeting-assistant/src/meeting_assistant/fathom/pipeline.py`
- `/Users/fonkey-oc/.openclaw/workspace-meeting-assistant/src/meeting_assistant/fathom/page_store.py`
- `/Users/fonkey-oc/.openclaw/workspace-meeting-assistant/src/meeting_assistant/fathom/mission_control.py`
- `/Users/fonkey-oc/.openclaw/openclaw-mission-control/apps/worker/src/meetings-ingestion.ts`
- `/Users/fonkey-oc/.openclaw/openclaw-mission-control/packages/db/src/sqlite.ts`
