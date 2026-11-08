"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "./assertion-card";
import { MeetingReviewItemShell, MeetingReviewListSection, MeetingReviewMetaItem } from "./meeting-review-list";

type SemanticStatusPayload = {
  semanticDbPath?: string;
  extractionSource?: { kind?: string; path?: string; roots?: string[]; bundleCount?: number; diagnostics?: string[] };
  index?: { latestIndexVersion?: Record<string, unknown> | null; versions?: unknown[] } | null;
  providers?: {
    synthesis?: { provider?: string; model?: string | null; operational?: boolean; diagnostics?: string[] };
    embedding?: { provider?: string; model?: string | null; operational?: boolean; diagnostics?: string[] };
  };
  operational?: boolean;
  diagnostics?: string[];
};

type SemanticConcept = { conceptId: string; label: string; summary?: string | null; status?: string };

type SemanticProposal = {
  proposalId: string;
  canonicalLabelSuggestion: string;
  definition?: string;
  whyItMatters?: string;
  confidence?: number;
  registryAction?: string;
  existingConceptId?: string | null;
  aliasesSuggested?: string[];
  linkedActionIds?: string[];
  linkedDecisionIds?: string[];
  linkedEvidenceWindowIds?: string[];
  reviewStatus?: string;
  targetConceptId?: string | null;
  applyReady?: boolean;
  missingTargets?: string[];
  rawJson?: string;
  supportingQuotes?: SemanticSupportingQuote[];
  retrieval?: { evidencePacketIds?: string[] };
};

type SemanticProposalRun = {
  proposalRunId: string;
  generatedAt?: string;
  indexVersion?: string;
  registrySnapshotVersion?: string;
  proposals: SemanticProposal[];
  rawJson?: string;
  evidencePackets?: SemanticEvidencePacket[];
};

type SemanticSourceRef = {
  sourceSystem?: string;
  sourceType?: string;
  sourceId?: string;
  title?: string;
  path?: string;
};

type SemanticSupportingQuote = {
  quote?: string;
  evidenceWindowId?: string | null;
  sourceRef?: SemanticSourceRef;
};

type SemanticEvidencePacket = {
  packetId: string;
  query?: { reason?: string; text?: string | null };
  includedActionIds?: string[];
  includedDecisionIds?: string[];
  evidenceWindowIds?: string[];
  meetingIds?: string[];
  noteRefs?: SemanticSourceRef[];
  retrievalScores?: Array<{ sourceId?: string; sourceKind?: string; score?: number; rank?: number }>;
  diagnostics?: string[];
  generatedAt?: string;
  indexVersion?: string;
};

type SemanticEvidenceItem = {
  evidenceWindowId: string;
  quote: string | null;
  packet: SemanticEvidencePacket | null;
  noteRef: SemanticSourceRef | null;
  score: number | null;
  rank: number | null;
};

type SemanticRefreshRun = {
  semanticRefreshRunId: string;
  status: "running" | "completed" | "failed";
  trigger?: string;
  source?: string | null;
  proposalRunId?: string | null;
  proposalsImported?: number;
  autoApplied?: number;
  pending?: number;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
};

type ApiResponse<T> = ({ ok: true; summary?: string } & T) | { ok: false; error?: string; disabled?: boolean };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok || (payload && typeof payload === "object" && "ok" in payload && payload.ok === false)) {
    const error = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return payload;
}

function latestIndexLabel(status: SemanticStatusPayload | null) {
  const latest = status?.index?.latestIndexVersion;
  if (!latest) return "No semantic index found";
  const id = latest.index_version_id ?? latest.indexVersionId ?? latest.id;
  return typeof id === "string" ? id : "Index available";
}

function formatConfidence(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidencePacketsForRun(run: SemanticProposalRun | null): SemanticEvidencePacket[] {
  if (!run) return [];
  if (Array.isArray(run.evidencePackets)) return run.evidencePackets;
  const raw = parseRecord(run.rawJson);
  return Array.isArray(raw?.evidencePackets) ? raw.evidencePackets as SemanticEvidencePacket[] : [];
}

function supportingQuotesForProposal(proposal: SemanticProposal | null): SemanticSupportingQuote[] {
  if (!proposal) return [];
  if (Array.isArray(proposal.supportingQuotes)) return proposal.supportingQuotes;
  const raw = parseRecord(proposal.rawJson);
  return Array.isArray(raw?.supportingQuotes) ? raw.supportingQuotes as SemanticSupportingQuote[] : [];
}

function evidencePacketIdsForProposal(proposal: SemanticProposal | null): string[] {
  if (!proposal) return [];
  if (Array.isArray(proposal.retrieval?.evidencePacketIds)) return proposal.retrieval.evidencePacketIds;
  const raw = parseRecord(proposal.rawJson);
  const retrieval = parseRecord(raw?.retrieval);
  return stringArray(retrieval?.evidencePacketIds);
}

function evidenceItemsForProposal(run: SemanticProposalRun | null, proposal: SemanticProposal | null): SemanticEvidenceItem[] {
  if (!proposal) return [];
  const linkedEvidenceWindowIds = proposal.linkedEvidenceWindowIds ?? [];
  const linkedEvidence = new Set(linkedEvidenceWindowIds);
  const linkedPacketIds = new Set(evidencePacketIdsForProposal(proposal));
  const packets = evidencePacketsForRun(run);
  const quotesByEvidenceWindowId = new Map(
    supportingQuotesForProposal(proposal)
      .filter((quote) => typeof quote.evidenceWindowId === "string" && quote.evidenceWindowId)
      .map((quote) => [quote.evidenceWindowId as string, typeof quote.quote === "string" && quote.quote.trim() ? quote.quote.trim() : null]),
  );
  const packetForEvidence = new Map<string, SemanticEvidencePacket>();
  for (const packet of packets) {
    if (linkedPacketIds.size > 0 && !linkedPacketIds.has(packet.packetId)) continue;
    for (const evidenceWindowId of packet.evidenceWindowIds ?? []) {
      if (linkedEvidence.has(evidenceWindowId) && !packetForEvidence.has(evidenceWindowId)) {
        packetForEvidence.set(evidenceWindowId, packet);
      }
    }
  }
  return linkedEvidenceWindowIds.map((evidenceWindowId) => {
    const packet = packetForEvidence.get(evidenceWindowId) ?? packets.find((item) => item.evidenceWindowIds?.includes(evidenceWindowId)) ?? null;
    const score = packet?.retrievalScores?.find((item) => item.sourceId === evidenceWindowId);
    return {
      evidenceWindowId,
      quote: quotesByEvidenceWindowId.get(evidenceWindowId) ?? null,
      packet,
      noteRef: packet?.noteRefs?.[0] ?? null,
      score: typeof score?.score === "number" && Number.isFinite(score.score) ? score.score : null,
      rank: typeof score?.rank === "number" && Number.isFinite(score.rank) ? score.rank : null,
    };
  });
}

function runLabel(run: SemanticProposalRun, index: number) {
  const generated = run.generatedAt ? new Date(run.generatedAt).toLocaleString() : null;
  return `Run ${index + 1}${generated ? ` · ${generated}` : ""}${run.indexVersion ? ` · ${run.indexVersion}` : ""}`;
}

function reviewStatusLabel(value: string | undefined) {
  if (!value || value === "pending") return "Needs review";
  if (value === "accepted") return "Auto-applied / accepted";
  if (value === "suppressed") return "Suppressed from repeats";
  return value.replace(/_/gu, " ");
}

export function SemanticConceptsPanel() {
  const [status, setStatus] = useState<SemanticStatusPayload | null>(null);
  const [proposalRuns, setProposalRuns] = useState<SemanticProposalRun[]>([]);
  const [refreshRuns, setRefreshRuns] = useState<SemanticRefreshRun[]>([]);
  const [concepts, setConcepts] = useState<SemanticConcept[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [targetConceptIds, setTargetConceptIds] = useState<Record<string, string>>({});
  const [selectedEvidenceProposalId, setSelectedEvidenceProposalId] = useState<string | null>(null);

  const selectedRun = useMemo(
    () => proposalRuns.find((run) => run.proposalRunId === selectedRunId) ?? proposalRuns[0] ?? null,
    [proposalRuns, selectedRunId],
  );
  const acceptedTargetConcepts = useMemo(
    () => concepts.filter((concept) => !concept.status || concept.status === "active"),
    [concepts],
  );
  const selectedEvidenceProposal = useMemo(
    () => selectedRun?.proposals.find((proposal) => proposal.proposalId === selectedEvidenceProposalId) ?? null,
    [selectedRun, selectedEvidenceProposalId],
  );
  const selectedEvidenceItems = useMemo(
    () => evidenceItemsForProposal(selectedRun, selectedEvidenceProposal),
    [selectedRun, selectedEvidenceProposal],
  );
  const semanticReady = Boolean(status?.operational);
  const latestRefreshRun = refreshRuns[0] ?? null;
  const proposalStatusCounts = useMemo(() => {
    const proposals = selectedRun?.proposals ?? [];
    return {
      autoApplied: proposals.filter((proposal) => proposal.reviewStatus === "accepted").length,
      pending: proposals.filter((proposal) => !proposal.reviewStatus || proposal.reviewStatus === "pending").length,
      rejected: proposals.filter((proposal) => proposal.reviewStatus === "rejected").length,
      suppressed: proposals.filter((proposal) => proposal.reviewStatus === "suppressed").length,
    };
  }, [selectedRun]);
  const proposalBuckets = useMemo(() => {
    const proposals = selectedRun?.proposals ?? [];
    return {
      needsReview: proposals.filter((proposal) => !proposal.reviewStatus || proposal.reviewStatus === "pending"),
      autoApplied: proposals.filter((proposal) => proposal.reviewStatus === "accepted"),
      suppressedRejected: proposals.filter((proposal) => proposal.reviewStatus === "rejected" || proposal.reviewStatus === "suppressed"),
    };
  }, [selectedRun]);
  const targetConceptExplanation = acceptedTargetConcepts.length === 1
    ? "Only one accepted accountability concept is available as a target because this dropdown is populated from active concepts already accepted into Mission Control."
    : `${pluralize(acceptedTargetConcepts.length, "accepted accountability concept")} available as targets from active concepts already accepted into Mission Control.`;

  async function refresh() {
    const [statusPayload, runsPayload, conceptsPayload] = await Promise.all([
      fetch("/api/accountability/semantic/status").then((response) => readJson<ApiResponse<{ status: SemanticStatusPayload }>>(response)),
      fetch("/api/accountability/semantic/proposal-runs").then((response) => readJson<ApiResponse<{ proposalRuns: SemanticProposalRun[]; refreshRuns?: SemanticRefreshRun[] }>>(response)),
      fetch("/api/accountability/concepts").then((response) => readJson<{ concepts?: SemanticConcept[] }>(response)),
    ]);
    if (statusPayload.ok) setStatus(statusPayload.status);
    if (runsPayload.ok) {
      const nextRuns = runsPayload.proposalRuns ?? [];
      setProposalRuns(nextRuns);
      setRefreshRuns(runsPayload.refreshRuns ?? []);
      setSelectedRunId((current) => nextRuns.some((run) => run.proposalRunId === current) ? current : nextRuns[0]?.proposalRunId || "");
    }
    setConcepts(conceptsPayload.concepts ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    refresh().catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEvidenceProposalId) return;
    if (!selectedRun?.proposals.some((proposal) => proposal.proposalId === selectedEvidenceProposalId)) {
      setSelectedEvidenceProposalId(null);
    }
  }, [selectedRun, selectedEvidenceProposalId]);

  async function pullIntoReview() {
    if (!semanticReady) {
      setMessage("Semantic layer is not operational yet. Configure real providers and build the semantic index first.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const payload = await readJson<ApiResponse<{ payload?: unknown }>>(
        await fetch("/api/accountability/semantic/proposal-runs/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() || null, reason: "mission_control_ui", importIntoReview: true }),
        }),
      );
      if (payload.ok) setMessage(payload.summary ?? "Pulled semantic proposal run.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  async function buildIndex() {
    setPending(true);
    setMessage(null);
    try {
      const payload = await readJson<ApiResponse<{ payload?: unknown }>>(
        await fetch("/api/accountability/semantic/index", { method: "POST" }),
      );
      if (payload.ok) setMessage(payload.summary ?? "Built semantic index.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  async function reviewProposal(proposal: SemanticProposal, action: "accept" | "reject" | "suppress" | "merge" | "add-alias") {
    if (action === "accept" && proposal.applyReady === false) {
      setMessage(`Cannot accept until missing targets resolve: ${(proposal.missingTargets ?? []).join(", ")}`);
      return;
    }
    const existingAcceptedTarget = acceptedTargetConcepts.some((concept) => concept.conceptId === proposal.existingConceptId) ? proposal.existingConceptId : "";
    const targetConceptId = targetConceptIds[proposal.proposalId] || existingAcceptedTarget || "";
    if ((action === "merge" || action === "add-alias") && !targetConceptId) {
      setMessage("Select a target concept first.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = action === "merge" || action === "add-alias" ? { targetConceptId } : {};
      if (action === "suppress") body.reason = "suppressed from semantic tuning console";
      if (action === "add-alias") body.aliasesAccepted = proposal.aliasesSuggested ?? [];
      const payload = await readJson<ApiResponse<{ payload?: unknown }>>(
        await fetch(`/api/accountability/semantic/proposals/${encodeURIComponent(proposal.proposalId)}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      if (payload.ok) {
        setMessage(payload.summary ?? "Reviewed semantic proposal.");
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  async function correctConcept(proposal: SemanticProposal, form: HTMLFormElement) {
    const formData = new FormData(form);
    const targetConceptId = proposal.targetConceptId || proposal.existingConceptId || "";
    const label = String(formData.get("label") || "").trim();
    const summary = String(formData.get("summary") || "").trim();
    if (!targetConceptId || !label) {
      setMessage("Auto-applied concept corrections require a target concept and label.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      for (const body of [
        { operation: "rename", conceptId: targetConceptId, label },
        { operation: "update_summary", conceptId: targetConceptId, summary },
      ]) {
        const payload = await readJson<{ ok?: boolean; summary?: string; error?: string }>(
          await fetch("/api/accountability/concepts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!payload.ok) throw new Error(payload.error ?? "Concept correction failed");
      }
      setMessage("Saved semantic concept correction.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function renderProposalCard(proposal: SemanticProposal, mode: "needs-review" | "auto-applied" | "suppressed-rejected") {
    const reviewDone = Boolean(proposal.reviewStatus && proposal.reviewStatus !== "pending");
    const targetConcept = concepts.find((concept) => concept.conceptId === (proposal.targetConceptId || proposal.existingConceptId));
    const evidenceWindowCount = (proposal.linkedEvidenceWindowIds ?? []).length;
    return (
      <article key={proposal.proposalId} className={`semantic-proposal-card semantic-proposal-card-${mode}`}>
        <div className="semantic-proposal-title-row">
          <div>
            <h4>{proposal.canonicalLabelSuggestion}</h4>
            <p>{proposal.definition || proposal.whyItMatters || "No definition supplied."}</p>
          </div>
          <span className={`semantic-readiness ${proposal.applyReady === false ? "semantic-readiness-blocked" : ""}`}>
            {proposal.applyReady === false ? "Not apply-ready" : reviewStatusLabel(proposal.reviewStatus)}
          </span>
        </div>
        <div className="meeting-review-meta">
          <span className="meeting-review-meta-item"><span>Confidence</span><strong>{formatConfidence(proposal.confidence)}</strong></span>
          <span className="meeting-review-meta-item"><span>Action</span><strong>{proposal.registryAction ?? "propose_new"}</strong></span>
          <span className="meeting-review-meta-item"><span>Review</span><strong>{reviewStatusLabel(proposal.reviewStatus)}</strong></span>
          <button
            type="button"
            className="meeting-review-meta-item semantic-evidence-link"
            aria-label={`Show evidence for ${proposal.canonicalLabelSuggestion}: ${pluralize(evidenceWindowCount, "window")}`}
            disabled={evidenceWindowCount === 0}
            onClick={() => setSelectedEvidenceProposalId(proposal.proposalId)}
          >
            <span>Evidence</span><strong>{pluralize(evidenceWindowCount, "window")}</strong>
          </button>
          <span className="meeting-review-meta-item"><span>Linked assertions</span><strong>{pluralize((proposal.linkedActionIds ?? []).length, "action")} · {pluralize((proposal.linkedDecisionIds ?? []).length, "decision")}</strong></span>
          {targetConcept ? <span className="meeting-review-meta-item"><span>Mission Control concept</span><strong>{targetConcept.label}</strong></span> : null}
        </div>
        {proposal.applyReady === false ? <p className="action-message">Missing linked targets: {pluralize((proposal.missingTargets ?? []).length, "unresolved assertion")}. Resolve targets before accepting.</p> : null}
        {proposal.aliasesSuggested?.length ? <p className="muted">Aliases: {proposal.aliasesSuggested.join(", ")}</p> : null}
        {mode === "needs-review" ? (
          <>
            <p className="muted semantic-target-help">{targetConceptExplanation}</p>
            <div className="semantic-proposal-actions">
              <button type="button" className="action-trigger" disabled={pending || reviewDone || proposal.applyReady === false} onClick={() => void reviewProposal(proposal, "accept")}>Accept</button>
              <button type="button" className="meeting-review-action-button" disabled={pending || reviewDone} onClick={() => void reviewProposal(proposal, "reject")}>Reject once</button>
              <button type="button" className="meeting-review-action-button" disabled={pending || reviewDone} onClick={() => void reviewProposal(proposal, "suppress")}>Suppress repeats</button>
              <select
                aria-label={`Target concept for ${proposal.canonicalLabelSuggestion}`}
                value={targetConceptIds[proposal.proposalId] ?? (acceptedTargetConcepts.some((concept) => concept.conceptId === proposal.existingConceptId) ? proposal.existingConceptId : "") ?? ""}
                onChange={(event) => {
                  const targetConceptId = event.currentTarget.value;
                  setTargetConceptIds((current) => ({ ...current, [proposal.proposalId]: targetConceptId }));
                }}
              >
                <option value="">Target concept…</option>
                {acceptedTargetConcepts.map((concept) => <option key={concept.conceptId} value={concept.conceptId}>{concept.label}</option>)}
              </select>
              <button type="button" className="meeting-review-action-button" disabled={pending || reviewDone} onClick={() => void reviewProposal(proposal, "merge")}>Merge</button>
              <button type="button" className="meeting-review-action-button" disabled={pending || reviewDone} onClick={() => void reviewProposal(proposal, "add-alias")}>Add alias</button>
            </div>
          </>
        ) : null}
        {mode === "auto-applied" ? (
          <form
            className="semantic-concept-correction-form"
            aria-label={`Correct ${proposal.canonicalLabelSuggestion}`}
            onSubmit={(event) => {
              event.preventDefault();
              void correctConcept(proposal, event.currentTarget);
            }}
          >
            <p className="muted">Auto-applied proposals are real Mission Control concepts now. Correct the concept label or summary here; assignment changes are available from the graph assertion details.</p>
            <input name="label" aria-label={`Corrected label for ${proposal.canonicalLabelSuggestion}`} defaultValue={targetConcept?.label ?? proposal.canonicalLabelSuggestion} />
            <textarea name="summary" aria-label={`Corrected summary for ${proposal.canonicalLabelSuggestion}`} defaultValue={targetConcept?.summary ?? proposal.definition ?? ""} rows={2} />
            <button type="submit" className="meeting-review-action-button" disabled={pending || !(proposal.targetConceptId || proposal.existingConceptId)}>Save correction</button>
          </form>
        ) : null}
        {mode === "suppressed-rejected" ? (
          <p className="muted">{proposal.reviewStatus === "suppressed" ? "Suppression is persisted and matching future suggestions are hidden from review by default." : "Rejected once; future matching suggestions may return unless suppressed."}</p>
        ) : null}
      </article>
    );
  }

  function renderEvidenceItem(item: SemanticEvidenceItem, index: number) {
    const meetingCount = item.packet?.meetingIds?.length ?? 0;
    const actionCount = item.packet?.includedActionIds?.length ?? 0;
    const decisionCount = item.packet?.includedDecisionIds?.length ?? 0;
    const sourceLabel = item.noteRef?.title ?? item.noteRef?.path ?? (meetingCount ? pluralize(meetingCount, "meeting") : "Semantic retrieval");
    return (
      <MeetingReviewItemShell key={`${item.evidenceWindowId}-${index}`} className="semantic-evidence-item">
        <div className="meeting-review-item-header">
          <div className="meeting-review-title-row">
            <span className="meeting-review-label">Evidence {index + 1}</span>
            <StatusBadge status="accepted">Semantic</StatusBadge>
          </div>
        </div>
        <p>{item.quote ?? "No supporting quote text was stored for this evidence window."}</p>
        <div className="meeting-review-meta">
          <MeetingReviewMetaItem label="Source" value={sourceLabel} />
          <MeetingReviewMetaItem label="Assertions" value={`${pluralize(actionCount, "action")} · ${pluralize(decisionCount, "decision")}`} />
          <MeetingReviewMetaItem label="Rank" value={item.rank === null ? null : item.rank} />
          <MeetingReviewMetaItem label="Score" value={item.score === null ? null : item.score.toFixed(2)} />
        </div>
        {item.quote ? (
          <details className="meeting-evidence-details" open>
            <summary>Transcript excerpt</summary>
            <pre className="meeting-evidence-snippet">{item.quote}</pre>
          </details>
        ) : null}
      </MeetingReviewItemShell>
    );
  }

  return (
    <section className="semantic-concepts-panel" aria-label="Semantic concept proposals">
      <div className="semantic-concepts-head">
        <div>
          <p className="eyebrow">Semantic concepts</p>
          <h3>Operational semantic layer</h3>
          <p className="muted">Autopilot tuning console for semantic concepts. Review pending provider-backed or calibrated fallback concepts, inspect auto-applied writes, and tune suppressions without exposing raw semantic IDs.</p>
          <p className="muted semantic-target-help">Target concept dropdowns list accepted active concepts only; the count updates from Mission Control’s accepted concept registry.</p>
        </div>
        <div className="semantic-proposal-actions">
          <button type="button" className="meeting-review-action-button" disabled={pending} onClick={() => refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error)))}>
            Refresh semantic state
          </button>
          <button type="button" className="action-trigger" disabled={pending || status?.providers?.embedding?.operational !== true} onClick={() => void buildIndex()}>
            Build semantic index
          </button>
        </div>
      </div>

      <div className="semantic-status-grid" aria-label="Semantic status">
        <span><strong>Source</strong>{status?.extractionSource?.kind ?? "loading"} · {status?.extractionSource?.bundleCount ?? 0} bundles</span>
        <span><strong>Index</strong>{latestIndexLabel(status)}</span>
        <span><strong>Store</strong>{status?.semanticDbPath ?? "not configured"}</span>
        <span><strong>Synthesis</strong>{status?.providers?.synthesis?.provider ?? "disabled"}{status?.providers?.synthesis?.model ? ` · ${status.providers.synthesis.model}` : ""}</span>
        <span><strong>Embeddings</strong>{status?.providers?.embedding?.provider ?? "disabled"}{status?.providers?.embedding?.model ? ` · ${status.providers.embedding.model}` : ""}</span>
        <span><strong>Readiness</strong>{semanticReady ? "Operational" : "Not operational"}</span>
        <span><strong>Latest refresh</strong>{latestRefreshRun ? `${latestRefreshRun.status} · ${latestRefreshRun.trigger ?? "semantic"}` : "No refresh runs yet"}</span>
      </div>
      {latestRefreshRun?.error ? <p className="action-message">Latest semantic refresh failed: {latestRefreshRun.error}</p> : null}
      {status?.diagnostics?.length ? <p className="action-message">{status.diagnostics.join("; ")}</p> : null}
      {message ? <p className="action-message mynt-message">{message}</p> : null}

      <details className="semantic-pull-details">
        <summary>Advanced: pull proposals now</summary>
      <form
        className="semantic-pull-form"
        onSubmit={(event) => {
          event.preventDefault();
          void pullIntoReview();
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} aria-label="Semantic proposal query" placeholder="Optional pull query or focus" />
        <button type="submit" className="action-trigger" disabled={pending || !semanticReady}>Pull proposals into review</button>
      </form>
      </details>

      {proposalRuns.length ? (
        <label className="semantic-run-picker">
          <span className="ops-label">Proposal run</span>
          <select value={selectedRun?.proposalRunId ?? ""} onChange={(event) => setSelectedRunId(event.currentTarget.value)}>
            {proposalRuns.map((run) => (
              <option key={run.proposalRunId} value={run.proposalRunId}>{runLabel(run, proposalRuns.indexOf(run))}</option>
            ))}
          </select>
        </label>
      ) : <p className="muted">No operational semantic proposal runs imported yet. Non-operational test runs are intentionally hidden.</p>}

      {selectedRun ? (
        <div className="semantic-review-layout">
          <div className="semantic-proposal-list">
            <p className="muted">
              {selectedRun.proposals.length} proposals · {proposalStatusCounts.autoApplied} auto-applied/accepted · {proposalStatusCounts.pending} pending · {proposalStatusCounts.rejected} rejected · {proposalStatusCounts.suppressed} suppressed · index {selectedRun.indexVersion || "unindexed"}
            </p>
            <section className="semantic-proposal-section" aria-label="Needs review">
              <h4>Needs review</h4>
              {proposalBuckets.needsReview.length ? proposalBuckets.needsReview.map((proposal) => renderProposalCard(proposal, "needs-review")) : <p className="muted semantic-empty-state">No pending proposals remain for this run.</p>}
            </section>
            <section className="semantic-proposal-section" aria-label="Auto-applied">
              <h4>Auto-applied</h4>
              {proposalBuckets.autoApplied.length ? proposalBuckets.autoApplied.map((proposal) => renderProposalCard(proposal, "auto-applied")) : <p className="muted semantic-empty-state">No auto-applied concepts in this run.</p>}
            </section>
            <section className="semantic-proposal-section" aria-label="Suppressed/rejected">
              <h4>Suppressed/rejected</h4>
              {proposalBuckets.suppressedRejected.length ? proposalBuckets.suppressedRejected.map((proposal) => renderProposalCard(proposal, "suppressed-rejected")) : <p className="muted semantic-empty-state">No suppressed or rejected concepts in this run.</p>}
            </section>
          </div>
          <aside className="meeting-detail semantic-evidence-sidebar" aria-label="Semantic proposal evidence">
            <div className="meeting-detail-heading">
              <h3>Evidence</h3>
              {selectedEvidenceProposal ? (
                <button type="button" className="meeting-pane-toggle" onClick={() => setSelectedEvidenceProposalId(null)}>
                  Clear
                </button>
              ) : null}
            </div>
            {selectedEvidenceProposal ? (
              <>
                <p className="muted">Evidence for {selectedEvidenceProposal.canonicalLabelSuggestion}</p>
                <MeetingReviewListSection title="Associated evidence" count={selectedEvidenceItems.length} emptyText="No evidence windows were linked to this proposal.">
                  {selectedEvidenceItems.map((item, index) => renderEvidenceItem(item, index))}
                </MeetingReviewListSection>
              </>
            ) : (
              <p className="meeting-review-empty">Select a proposal evidence count to inspect its supporting evidence.</p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
