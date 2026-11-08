# Semantic Layer Phased Implementation Plan v2

## Executive summary

Build the semantic layer as an **independent, local-first post-processor of curated Obsidian meeting notes**. It owns semantic extraction and indexing: assertion candidates, evidence links/windows, people/participant entities, concept candidates, chunks, embeddings, retrieval indexes, and calibration artifacts.

Mission Control remains the **product truth and operational curation layer** with its own database. Its current ingestion path from `meeting-assistant` outputs must keep working unchanged. Mission Control should later query/import semantic-layer concept proposals, but Mission Control is **not** the extractor and should not own generic lexical/semantic assertion or evidence discovery logic long term.

`meeting-assistant` also stays stable for now: it continues capturing meetings and writing curated Obsidian transcript artifacts, including the existing extraction output. Do **not** remove, bypass, or jeopardize `meeting-assistant` extraction until the semantic layer has proven a compatible replacement path and the product is ready to switch.

The corrected split is:

```text
Meeting sources / Fathom
        |
        v
meeting-assistant
  - captures meetings
  - normalizes source payloads
  - extracts current actions/decisions as it does today
  - writes curated Obsidian meeting note artifact
        |
        v
Obsidian meeting notes
  - canonical human-readable artifact
  - stable local source for both current MC ingestion and semantic post-processing
        |                                      |
        | existing path, unchanged             | new independent path
        v                                      v
Mission Control ingestion                 Semantic layer
  - parses current note format             - reads curated notes directly
  - persists MC product DB                 - extracts assertion candidates
  - keeps existing concept tables          - extracts evidence windows/links
  - owns curation, UI, APIs                - extracts people/entities
  - existing ingestion still works         - proposes concepts
                                           - chunks/embeds/indexes locally
                                           - calibrates independently
        ^                                      |
        | semantic client/import contract      |
        +--------------------------------------+

Mission Control concept product
  - queries/imports semantic proposals behind flags
  - applies curation rules and audit events
  - later replaces stale internal lexical proposal logic
```

## Hard architecture rules

1. **Backward compatibility is non-negotiable.** With semantic flags off, meeting capture, Obsidian note writes, Mission Control ingestion, existing concepts, graph behavior, and APIs must continue exactly as today.
2. **Mission Control is not the extractor.** MC owns product truth, curation semantics, concept lifecycle, UI, and operational APIs. It should consume semantic proposals, not perform generic assertion/evidence/concept extraction itself.
3. **The semantic layer owns assertion abstraction/proposals.** It independently post-processes curated Obsidian notes and produces candidate assertions, evidence windows, participant/person entities, concept proposals, chunks, embeddings, and indexes.
4. **`meeting-assistant` extraction remains intact until replacement is proven.** Existing extracted actions/decisions in the note are valid inputs/signals, not code to delete in early phases.
5. **Semantic layer must be independently calibratable.** It must run on fixtures/local notes without Mission Control, produce metrics, and support threshold/model/index tuning outside the MC product DB.
6. **Local-first only.** Prefer SQLite, FTS5, optional `sqlite-vec`, local/Ollama/OpenClaw embedding providers, JSONL fixtures, and rebuildable local stores. Do not require SaaS vector databases or hosted subscriptions.
7. **MC concept migration is late.** Concepts already exist in MC. Refactor MC to source concept proposals from the semantic layer only after semantic precision and compatibility are demonstrated.
8. **Retired lexical proposal code stays retired.** The active Mission Control path pulls/imports semantic proposal-run artifacts through the web API/UI; do not reintroduce the old lexical concept extraction/backfill fallback.

## Ownership boundaries

### `meeting-assistant`

Owns today, unchanged in early phases:

- vendor capture and retry behavior
- source payload normalization
- current transcript/action/decision extraction
- curated Obsidian meeting note writes
- provenance already embedded in note artifacts

Does not own in this plan:

- long-term semantic index lifecycle
- concept proposal calibration
- Mission Control curation/product DB writes

### Obsidian notes

Own:

- local, human-readable meeting artifacts
- operator-editable source notes
- stable source paths and content hashes for provenance

Do not own:

- vector/index storage
- product truth
- calibration decisions

### Semantic layer

Owns:

- Obsidian meeting-note discovery/reading/parsing
- semantic source refs and content hashing
- assertion candidate extraction/normalization
- evidence-window extraction and source anchoring
- participant/person/entity extraction and alias normalization candidates
- concept candidate proposal generation
- chunks, embeddings, FTS/vector/hybrid indexes
- local store/index versions
- calibration datasets, metrics, thresholds, and comparison reports
- export/import contracts for consumers

Does not own:

- Mission Control concept lifecycle states and curation events
- one-concept-per-assertion enforcement in MC product state
- MC graph/UI behavior
- meeting-assistant runtime behavior

### Mission Control

Owns:

- product database and operational truth
- existing meetings/assertions/evidence/concepts/assignments/events
- concept lifecycle, curation rules, graph/UI/API behavior
- current ingestion process from `meeting-assistant` notes
- semantic client/adapter used by MC product flows

Does not own long term:

- generic semantic extraction from notes
- embedding/index/provider lifecycle
- calibration tooling internals
- stale internal lexical assertion/evidence/concept discovery once semantic replacement is proven

## Local-first storage and runtime recommendation

Package/runtime ownership:

- The semantic layer lives outside Mission Control as an OpenClaw platform-local package: `/Users/fonkey-oc/.openclaw/lib/semantic-layer`.
- Package name: `@openclaw/semantic-layer`.
- Mission Control must consume this package through an adapter/client in later phases; it must not re-own or vendor the semantic implementation under `openclaw-mission-control/packages/*`.
- Calibration artifacts may be written into Mission Control docs for review, but the executable semantic package and fixtures live in the OpenClaw semantic-layer package.

Use a separate semantic store, not the MC database:

- SQLite database per collection or profile, e.g. `~/.openclaw/semantic/meetings.sqlite`.
- FTS5 for lexical retrieval.
- Embedding cache keyed by text/content hash + provider/model/dimensions.
- Optional `sqlite-vec` for vector search.
- In-process cosine fallback when `sqlite-vec` is unavailable.
- Lexical-only degraded mode when embeddings are unavailable.
- JSONL imports/exports for fixtures, proposal runs, and calibration output.

Runtime modes:

1. **Standalone CLI**: read Obsidian notes or fixture JSONL, extract, index, propose, calibrate.
2. **Library/client mode**: MC calls semantic APIs locally behind feature flags.
3. **Optional service mode**: local HTTP process only if concurrency/scale requires it later.

## Core contracts, versioned

These are intentionally illustrative; implementation should keep them JSON-schema-compatible and versioned.

```ts
type SemanticSourceRef = {
  sourceSystem: "obsidian" | "meeting_assistant" | "mission_control" | string;
  sourceType: "meeting_note" | "assertion_candidate" | "evidence_window" | "person_entity" | string;
  sourceId: string;
  canonicalSourcePath?: string | null;
  contentHash?: string | null;
  recordingId?: string | null;
  meetingAssistantRunId?: string | null;
  missionControlId?: string | null;
};

type SemanticMeetingNote = {
  semanticNoteId: string;
  sourceRef: SemanticSourceRef;
  title: string;
  meetingDate?: string | null;
  rawMarkdown: string;
  sections: Record<string, string>;
  provenance: {
    contentHash: string;
    parsedAt: string;
    parserVersion: string;
  };
};

type SemanticAssertionCandidate = {
  candidateId: string;
  noteId: string;
  kind: "action" | "decision" | "claim" | "risk" | "open_question" | string;
  text: string;
  normalizedText?: string | null;
  source: "meeting_assistant_existing_extraction" | "semantic_extraction" | "manual_fixture" | string;
  sourceRef: SemanticSourceRef;
  evidenceWindowIds: string[];
  participantEntityIds: string[];
  confidence: number;
  extractionVersion: string;
};

type SemanticEvidenceWindow = {
  evidenceWindowId: string;
  noteId: string;
  text: string;
  sourceRef: SemanticSourceRef;
  offsets?: {
    startChar?: number;
    endChar?: number;
    startTimestamp?: string | null;
    endTimestamp?: string | null;
  };
  supportsCandidateIds: string[];
};

type SemanticPersonEntity = {
  personEntityId: string;
  noteId: string;
  displayName: string;
  aliases: string[];
  sourceRef: SemanticSourceRef;
  confidence: number;
};

type SemanticConceptCandidate = {
  conceptCandidateId: string;
  proposalRunId: string;
  labelSuggestion: string;
  summarySuggestion?: string | null;
  memberAssertionCandidateIds: string[];
  supportingEvidenceWindowIds: string[];
  recurrenceSignals: {
    assertionCandidateCount: number;
    meetingNoteCount: number;
    participantEntityCount: number;
    crossMeetingScore?: number;
  };
  confidence: number;
  rationale: string[];
  generation: {
    algorithm: string;
    algorithmVersion: string;
    indexVersionId: string;
    thresholds: Record<string, number>;
  };
};
```

MC adapter contracts should map semantic candidates to existing MC concepts only after MC validates:

- source note is already ingested or explicitly allowed
- candidate maps to current MC assertion/evidence records, when applying to product state
- one-concept-per-assertion remains enforced
- manual curation and existing concept assignments win unless explicitly overridden
- accepted writes go through existing MC curation helpers/events

## Phased implementation plan

### Phase 0 — Obsidian Task: Architecture guardrails and compatibility contract

**Scope**

- Capture the corrected architecture in docs.
- Freeze the compatibility rules before implementation.
- Decide semantic package/module location without committing to MC coupling.

**Implementation units**

- This plan document.
- ADR or README section stating: MC is not extractor; semantic layer owns proposals; `meeting-assistant` extraction stays intact.
- Dependency-direction rules for future packages.
- Feature flag names/modes draft.

**Tests**

- Documentation review only.
- No runtime tests.

**Success criteria**

- Architecture is explicit enough that no phase requires MC ingestion changes.
- All parties agree semantic extraction starts from curated Obsidian notes.
- Backward compatibility and late lexical removal are documented as hard gates.

**Rollback/compatibility notes**

- Documentation-only; no behavior changes.

**Risks**

- Ambiguity around whether semantic layer may read MC DB. Mitigation: early semantic phases must run without MC.

---

### Phase 1 — Obsidian Task: Standalone note reader and fixture harness

**Scope**

- Build the semantic layer’s independent ability to discover/read curated Obsidian meeting notes and produce stable parsed note fixtures.
- Do not write to MC.
- Do not change `meeting-assistant`.

**Implementation units**

- Semantic package/module skeleton, independent of MC imports.
- Obsidian note locator with allowlisted vault/root paths.
- Markdown/frontmatter parser for current meeting note format.
- Stable source refs, note IDs, content hashes, parser version metadata.
- JSONL fixture export command: notes in, normalized `SemanticMeetingNote` records out.

**Tests**

- Parser tests using representative curated notes.
- Stable ID/content-hash tests.
- Frontmatter/section extraction tests.
- Path safety tests: rejects files outside configured roots.
- Independence test: semantic package has no imports from MC DB/web/worker modules.

**Success criteria**

- Same note produces the same parsed semantic note ID and hash.
- CLI can parse notes and write fixture JSONL without Mission Control running.
- Existing MC ingestion and `meeting-assistant` outputs are untouched.

**Rollback/compatibility notes**

- Remove the standalone semantic package/CLI or ignore generated fixtures.
- No product DB or note format changes.

**Risks**

- Note format drift. Mitigate with parser versioning and fixtures from real notes.
- Accidentally treating edited Obsidian notes as product truth. Mitigate by storing provenance and leaving MC product state unchanged.

---

### Phase 2 — Obsidian Task: Semantic extraction of assertions, evidence, and people

**Scope**

- From parsed Obsidian notes, produce semantic-layer-owned assertion candidates, evidence windows, and person/participant entities.
- Existing `meeting-assistant` extraction output in the note may be used as an input signal, but it is not removed or modified.
- Still no MC writes and no MC ingestion changes.

**Implementation units**

- Extraction contracts/schemas for `SemanticAssertionCandidate`, `SemanticEvidenceWindow`, `SemanticPersonEntity`.
- Deterministic extraction baseline from current note sections:
  - existing actions/decisions emitted by `meeting-assistant`
  - transcript/evidence windows linked back to note offsets/timestamps where possible
  - participants/aliases from frontmatter and note body
- Candidate provenance with source section and extraction version.
- JSONL export: notes -> candidates/entities/evidence.

**Tests**

- Golden fixture extraction tests.
- Evidence window anchoring tests.
- Participant alias normalization candidate tests.
- Duplicate candidate suppression tests.
- Regression test that extraction can run without MC.
- Test that missing sections degrade gracefully instead of failing the full note.

**Success criteria**

- Semantic layer can reproduce useful assertion/evidence/person candidates from curated notes independently.
- Candidate provenance links each output back to the note and section/window.
- No existing `meeting-assistant` extraction code is changed.

**Rollback/compatibility notes**

- Delete or ignore generated semantic candidates.
- MC continues to use current ingested assertions.

**Risks**

- Semantic extraction may diverge from current MC-ingested assertions. Mitigate by comparing later in shadow mode, not by changing MC now.
- Transcript evidence can be sensitive. Keep outputs local, provenance-aware, and rebuildable.

---

### Phase 3 — Obsidian Task: Local chunks, embeddings, and hybrid index

**Scope**

- Add rebuildable local semantic storage and retrieval for notes, candidates, evidence windows, and chunks.
- Remain independent from MC.

**Implementation units**

- Semantic SQLite store with migrations/create script.
- Tables for notes, candidates, evidence windows, person entities, chunks, embeddings, index versions.
- FTS5 lexical index.
- Embedding provider abstraction with local/OpenClaw Gateway-compatible adapter.
- Optional `sqlite-vec`; in-process cosine fallback.
- CLI commands: import fixtures, build index, retrieve neighbors, inspect index status.

**Tests**

- Temp SQLite store tests.
- Idempotent import/index tests.
- FTS retrieval tests.
- Mocked embedding/vector retrieval tests.
- Degraded mode tests when embeddings or `sqlite-vec` are unavailable.
- Rebuild-from-fixtures test.

**Success criteria**

- Local fixture corpus can be indexed and queried.
- Index version records chunk strategy, embedding model, provider, dimensions, and degraded/ready status.
- No SaaS/vector subscription is required.

**Rollback/compatibility notes**

- Semantic DB is separate and disposable.
- Rebuild from Obsidian notes/fixtures when needed.

**Risks**

- Local model/provider availability varies. Mitigate with explicit degraded FTS-only mode.
- Native extension friction for vector search. Mitigate with optional `sqlite-vec` and pure JS/in-process fallback.

---

### Phase 4 — Obsidian Task: Concept proposal generation and calibration harness

**Scope**

- Generate concept candidates from semantic assertion candidates and evidence neighborhoods.
- Calibrate independently before Mission Control consumes outputs.
- Favor precision over coverage; do not force every assertion into a concept.

**Implementation units**

- Similarity/neighborhood retrieval over assertion candidates.
- Proposal generator with recurrence thresholds:
  - minimum candidate count
  - cross-meeting signal
  - participant diversity signal
  - generic-topic suppression
  - evidence support requirements
- Label/summary suggestion baseline, preferably extractive/deterministic first.
- Calibration CLI with golden labels, negative examples, threshold sweeps, and metrics.
- Proposal-run JSON export.

**Tests**

- One-off assertion exclusion tests.
- Cross-meeting recurrence tests.
- Generic/routine topic suppression tests.
- Evidence-supported proposal tests.
- Snapshot/schema tests for proposal run output.
- Calibration metric tests: precision@K, coverage, duplicate rate, false-positive samples.

**Success criteria**

- Semantic layer can produce explainable concept proposals from Obsidian notes without MC.
- Calibration report makes threshold tradeoffs visible.
- Proposal quality is measurable before any product integration.

**Rollback/compatibility notes**

- Proposal runs are advisory JSON/local DB rows.
- No MC product state changes.

**Risks**

- Semantic similarity can over-cluster generic operations. Mitigate with strict thresholds and negative examples.
- LLM labels can invent details. Keep labels extractive until review/validation exists.

---

### Phase 4.1 — Obsidian Task: Move semantic package to OpenClaw platform location

**Scope**

- Move the implemented semantic layer out of the Mission Control monorepo and into the OpenClaw platform-local package location.
- Preserve calibration outputs so Francesco can continue reviewing quality before MC integration.
- Update later phases so MC consumes `@openclaw/semantic-layer` instead of assuming an MC-owned package.

**Implementation units**

- Move `packages/semantic` to `/Users/fonkey-oc/.openclaw/lib/semantic-layer`.
- Rename package from `@ocmc/semantic` to `@openclaw/semantic-layer`.
- Make the package self-contained with its own `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, tests, fixtures, and CLI.
- Remove stale MC workspace references to `packages/semantic`.
- Regenerate review artifacts under `docs/accountability-concepts/semantic-layer-artifacts/` from the new package path.
- Update this plan and future phase language to make dependency direction explicit.

**Tests**

- Run semantic-layer package tests from `/Users/fonkey-oc/.openclaw/lib/semantic-layer`.
- Run semantic-layer TypeScript check from the new package location.
- Regenerate parse/extract/index/propose/calibrate/query/status artifacts from the new CLI.
- Verify generated artifacts no longer point to the old MC package path.

**Success criteria**

- `@openclaw/semantic-layer` runs independently outside the MC repo.
- MC no longer contains the semantic package implementation.
- Calibration artifacts remain available for review and are generated from the OpenClaw package.
- Future phases can proceed without conceptual drift: MC is a consumer/client, not semantic package owner.

**Rollback/compatibility notes**

- If the package move breaks standalone execution, restore the package from VCS/local copy before starting MC integration.
- No MC ingestion, meeting-assistant runtime, or MC product state changes occur in this phase.
- Calibration artifacts are disposable and can be regenerated from the OpenClaw package.

**Risks**

- Dependency/install behavior can differ outside the MC pnpm workspace. Mitigate with package-local lockfile, tests, and typecheck.
- Later MC integration may be tempted to import source paths directly. Mitigate by using a narrow adapter/client and documenting package ownership here.

---

### Phase 5 — Obsidian Task: Mission Control semantic client in shadow mode

**Scope**

- Let Mission Control query/read semantic-layer outputs for comparison only.
- Do not modify MC ingestion.
- Do not create or assign MC concepts from semantic output yet.

**Implementation units**

- MC-owned adapter/client that consumes `@openclaw/semantic-layer` outputs, proposal-run JSON, or a local semantic API. The adapter belongs to MC; the semantic implementation remains in `/Users/fonkey-oc/.openclaw/lib/semantic-layer`.
- Shadow comparison command/report:
  - current MC concepts/lexical proposals vs semantic proposals
  - unmatched semantic candidates
  - MC assertions without semantic candidate mapping
  - precision review notes where labels exist
- Feature flags default off.
- Source mapping helper from semantic source refs to current MC meetings/assertions where possible.

**Tests**

- Feature flag disabled test: no semantic calls and existing responses unchanged.
- Shadow report tests using fixture semantic proposal runs.
- Mapping tests for current ingested note/assertion references.
- No-write regression tests for MC concept, assignment, and event tables.
- Existing MC ingestion tests unchanged.

**Success criteria**

- MC can inspect semantic proposals without changing product state.
- Existing ingestion from `meeting-assistant` outputs still passes unchanged.
- Shadow reports reveal compatibility gaps before review/import UX exists.

**Rollback/compatibility notes**

- Disable flags or remove report command.
- No schema/product data changes required in this phase.

**Risks**

- Mapping semantic candidates to existing MC assertions may be imperfect. Treat this as calibration input, not a reason to alter ingestion.
- Shadow mode could be mistaken for source of truth. Reports must label semantic output as advisory.

---

### Phase 6 — Obsidian Task: MC candidate review/import state, still non-authoritative

**Scope**

- Add additive MC review state for semantic proposal runs.
- Imported semantic proposals are review objects, not product concepts.
- Existing MC concept implementation remains authoritative.

**Implementation units**

- Additive tables or local review-store records for semantic candidate runs/proposals/members.
- Import command/API for semantic proposal runs in `shadow` or `review` mode.
- Optional internal review UI/debug panel behind flags.
- Candidate status actions: needs-review, accepted-for-apply, discarded, uncertain, renamed.
- Provenance display: semantic index version, extraction version, thresholds, calibration run.

**Tests**

- Idempotent import by proposal run ID.
- Invalid/unmapped source refs remain unresolved review items, not product writes.
- Flags off means no UI/API exposure.
- Existing concept APIs and graph loaders unchanged.
- Existing lexical concept/backfill tests unchanged.

**Success criteria**

- Semantic proposal runs can be reviewed inside MC without creating concepts or assignments.
- Review decisions are auditable and can feed semantic calibration later.
- Backward compatibility holds with flags off.

**Rollback/compatibility notes**

- Disable review flag.
- Candidate review tables/state are additive and can be ignored.
- No existing concept rows need migration.

**Risks**

- Review state may be confused with product truth. Use explicit naming: semantic candidates/proposals, not concepts.
- New UI may create workflow burden. Keep it optional/internal until quality is proven.

---

### Phase 7 — Obsidian Task: Semantic-backed concept application path

**Scope**

- Allow explicitly reviewed semantic candidates to create/update MC concepts using existing MC curation helpers.
- This is the first phase where semantic output may affect MC product state, and only by reviewed action.
- Use only reviewed semantic candidates for concept application; do not reintroduce lexical backfill as a fallback.

**Implementation units**

- Apply reviewed candidate action.
- Map semantic candidate members to current MC action/decision assertions.
- Use existing MC concept helpers/events for writes:
  - create/update concept
  - assign assertion concept
  - merge/discard/rename where supported
  - event/audit logging
- Conflict handling: manual/existing assignments win unless explicit override.
- Small-batch apply with preview/dry-run.

**Tests**

- Accepted candidate creates concept through existing code paths.
- Assignments preserve one-concept-per-assertion invariant.
- Existing manual assignment conflict test.
- Discarded semantic candidate does not alter product concept state.
- Dry-run/apply parity tests.
- Graph/API regression tests after applied concepts.

**Success criteria**

- Reviewed semantic candidates become normal MC concepts only through existing curation semantics.
- No unreviewed semantic proposal can create or reassign concepts.
- Lexical backfill remains available and unchanged.

**Rollback/compatibility notes**

- Disable apply flag.
- Applied concepts are ordinary MC concept events and can be curated/merged/discarded via existing workflows.
- Continue using lexical path if semantic quality regresses.

**Risks**

- Candidate-to-assertion mapping could assign the wrong concept. Mitigate with preview, explicit review, and manual assignment precedence.
- Batch apply can create noise. Keep batch sizes small and reviewed.

---

### Phase 8 — Obsidian Task: Refactor MC concept discovery to semantic source

**Scope**

- Replace MC’s internal lexical concept proposal/backfill path with semantic-layer-backed proposals as the preferred implementation.
- Preserve CLI/API compatibility where possible.
- Keep old lexical path behind fallback/legacy mode during this phase.

**Implementation units**

- Refactor MC concept proposal command(s) to call semantic client for candidate generation.
- Keep command names/options compatible, adding explicit modes if needed:
  - `legacy-lexical`
  - `semantic-shadow`
  - `semantic-review`
  - `semantic-apply-reviewed`
- Update docs/runbooks to describe semantic as preferred proposal source.
- Comparison report required before promotion.
- Migration note for operators: no automatic destructive changes.

**Tests**

- Existing command compatibility tests.
- Semantic mode tests with fixture proposal run/API.
- Lexical fallback/backfill mode is absent from active worker code.
- Feature flag default-off regression.
- End-to-end dry-run: semantic proposal -> review import -> reviewed apply.

**Success criteria**

- MC concepts can be proposed from semantic layer without relying on internal lexical grouping logic.
- Existing operational entrypoints still work or fail with clear compatibility messages.
- Semantic path meets agreed precision/curation burden gates on recent and historical fixtures.

**Rollback/compatibility notes**

- Switch mode back to `legacy-lexical` or disable semantic flags.
- Since applied concepts use normal MC events, product state remains valid.

**Risks**

- Refactor may accidentally change backfill semantics. Mitigate with legacy-vs-semantic comparison tests and preserving legacy mode until Phase 9.
- Operators may promote semantic too early. Require documented calibration gates.

---

### Phase 9 — Obsidian Task: Retire stale internal lexical extraction/backfill

**Scope**

- Late cleanup phase only after semantic-backed concept discovery is proven and tested.
- Remove or quarantine stale MC internal lexical assertion/evidence/concept extraction logic that has been replaced by the semantic layer.
- Do not remove `meeting-assistant` extraction here unless a separate approved migration exists.

**Implementation units**

- Identify lexical-only MC implementation pieces now superseded by semantic client/proposal contracts.
- Delete dead code or move to clearly named legacy module if still needed for rollback window.
- Remove obsolete tests and replace with semantic contract/client tests.
- Update docs, runbooks, and feature flag defaults.
- Keep data migrations additive; do not delete historical concept events.

**Tests**

- Full MC worker/web accountability concept test suite.
- Semantic contract integration tests.
- Ingestion regression tests from current `meeting-assistant` notes.
- Backward-compatible command/API tests or documented deprecation tests.
- Manual rollback rehearsal on fixture DB if legacy mode is removed.

**Success criteria**

- No stale internal lexical concept extraction/backfill path remains in active MC code.
- Semantic-backed path is the tested default.
- Existing MC ingestion still works from `meeting-assistant` outputs.
- Historical concepts/events remain readable and curatable.

**Rollback/compatibility notes**

- This is the first meaningfully hard-to-rollback cleanup. Do it only after a tagged release/checkpoint.
- Prefer one release cycle with legacy mode disabled but still present before deleting code.
- Keep DB state compatible; do not drop concept/event tables.

**Risks**

- Removing fallback too early can strand operations if semantic provider/index breaks. Mitigate with prior release-cycle soak and degraded-mode behavior.
- Cleanup might accidentally target `meeting-assistant` extraction. Explicitly out of scope unless separately approved.

## Promotion gates

Do not progress to MC product writes or lexical retirement until these are true:

- Semantic layer runs independently on curated Obsidian notes.
- Fixture extraction is deterministic and provenance-rich.
- Calibration reports show acceptable precision on recent and historical note samples.
- MC shadow comparison has no ingestion regressions.
- Feature flags default off until reviewed apply is explicitly enabled.
- Existing lexical path remains tested through Phase 8.
- Phase 9 deletion has a separate rollback/checkpoint plan.

## Backward compatibility checklist

- [ ] `meeting-assistant` capture/extraction/note write behavior unchanged.
- [ ] Current Obsidian note format remains accepted by MC ingestion.
- [ ] MC ingestion process is not modified in early semantic phases.
- [ ] Existing concept tables/API/UI/graph continue to work with semantic flags off.
- [x] Existing lexical backfill has been removed from active worker code; semantic proposal-run pull/import through the web API/UI is the supported review source.
- [ ] Semantic DB is separate from MC DB and rebuildable.
- [ ] No SaaS vector DB or hosted subscription is required.
- [ ] All semantic outputs are advisory until reviewed MC apply.

## Changes from prior `semantic-layer-phased-plan.md`

- Re-centered the semantic layer on **direct Obsidian-note post-processing**, not MC-exported documents as the primary v1 source.
- Made explicit that **Mission Control is not the extractor** and should not own assertion abstraction/proposals long term.
- Made explicit that the semantic layer owns **assertion candidates, evidence windows, people/entities, concept candidates, chunks, embeddings, indexes, and calibration**.
- Preserved current `meeting-assistant` extraction as a hard compatibility requirement, rather than treating it as replaceable early.
- Moved MC integration later and made it client/shadow/review/apply-only, with no MC ingestion changes.
- Added a late, explicit Phase 9 for retiring stale internal lexical MC concept extraction/backfill only after semantic replacement is proven.
- Strengthened local-first requirements and independent calibration gates.
