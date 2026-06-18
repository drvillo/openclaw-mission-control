"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { formatDisplayDayDate, formatDisplayDateTime } from "../lib/date-format";
import { DEFAULT_PACKET_AGENT_ID, PACKET_RUNTIME_AGENT_OPTIONS, packetRuntimeAgentReason } from "../lib/runtime-agent-catalog";
import { buildSelfEvolutionDayHref, buildWorkTaskHref, isPacketId, isTaskId } from "../lib/self-evolution-links";
import { ActionButton } from "./action-button";
import { StatusBadge } from "./assertion-card";
import { CompactSelect } from "./compact-select";
import { ObsidianMarkdown, type ObsidianDocumentReference } from "./obsidian-markdown";

type SelfEvolutionLink = ObsidianDocumentReference;

type SelfEvolutionReviewTask = {
  id: string;
  title: string | null;
  status: string | null;
  detailsRef: string | null;
  resultsRef: string | null;
  wikiRef: string | null;
};

type SelfEvolutionRuntimeInvocation = {
  id: string;
  agentId: string;
  status: string;
  obsidianTaskId: string | null;
  detailsPath: string | null;
  sessionKey: string | null;
  runId: string | null;
  runtimeTaskId: string | null;
  error: string | null;
  defaultAgentId: string | null;
  selectedAgentId: string | null;
  agentSelectionReason: string | null;
} | null;

type SelfEvolutionPacket = {
  date: string;
  dates: string[];
  generatedAt: string | null;
  id: string;
  title: string;
  summary: string;
  domain: string;
  analyzer: string | null;
  owner: string;
  value: number;
  risk: string;
  complexity: string;
  status: string | null;
  dedupeKey: string | null;
  canonicalKey: string;
  approvalClassification: string | null;
  approvalClass: string | null;
  evidence: string[];
  rollback: string | null;
  validation: string[];
  sourceNote: string | null;
  note: ObsidianDocumentReference;
  reviewTask: SelfEvolutionReviewTask | null;
  document: ObsidianDocumentReference | null;
  attic?: boolean;
  runtimeInvocation?: SelfEvolutionRuntimeInvocation;
};

type SelfEvolutionRun = {
  date: string;
  generatedAt: string | null;
  allGatesOk: boolean | null;
  packetCount: number;
  reviewTask: SelfEvolutionReviewTask | null;
  gates: Array<{ name: string; ok: boolean }>;
  mutatingActions: Array<{ kind: string; target: string }>;
  note: ObsidianDocumentReference;
  packets: SelfEvolutionPacket[];
};

type SelfEvolutionPanelProps = {
  selfEvolution: {
    latestDate: string | null;
    latestGeneratedAt: string | null;
    allGatesOk: boolean | null;
    packetCount: number;
    reviewTaskId: string | null;
    reviewTaskStatus: string | null;
    gates: Array<{ name: string; ok: boolean }>;
    runs: SelfEvolutionRun[];
    packets: SelfEvolutionPacket[];
    mutatingActions: Array<{ kind: string; target: string }>;
    links: {
      latestNote: SelfEvolutionLink | null;
      index: SelfEvolutionLink;
      curriculum: SelfEvolutionLink;
      systemMap: SelfEvolutionLink;
      valuesModel: SelfEvolutionLink;
      evalCorpus: SelfEvolutionLink;
    };
  };
  cronJob: { lastRunStatus: string | null; lastRunAtMs: number | null; nextRunAtMs: number | null } | null;
  selectedDate?: string;
  selectedPacketId?: string;
};

function formatDateTime(value: string | number | null) {
  return formatDisplayDateTime(value);
}

function packetKey(packet: { date: string; id: string }) {
  return `${packet.date}:${packet.id}`;
}

function invocationReference(invocation: NonNullable<SelfEvolutionRuntimeInvocation>) {
  return invocation.runId ? `run ${invocation.runId}` : invocation.sessionKey ? `session ${invocation.sessionKey}` : invocation.runtimeTaskId ? `runtime task ${invocation.runtimeTaskId}` : `invocation ${invocation.id}`;
}

function invocationStateLabel(invocation: NonNullable<SelfEvolutionRuntimeInvocation>) {
  const prefix = invocation.status === "failed" ? "Last attempt failed" : invocation.status === "running" ? "Already submitted" : invocation.status === "submitted" ? "Submitting" : "Already submitted";
  return `${prefix} to ${invocation.agentId} · ${invocationReference(invocation)}`;
}

function isPacketDone(packet: SelfEvolutionPacket) {
  return packet.status?.trim().toLowerCase() === "done";
}

function isLegacyReviewPacket(packet: SelfEvolutionPacket) {
  return packet.id.startsWith("SE-REVIEW-");
}

function hasActiveRuntimeInvocation(packet: SelfEvolutionPacket) {
  return Boolean(packet.runtimeInvocation && packet.runtimeInvocation.status !== "failed");
}

function canTriggerPacketImplementation(packet: SelfEvolutionPacket) {
  const normalizedStatus = packet.status?.trim().toLowerCase() ?? "";
  return !isLegacyReviewPacket(packet) && !packet.attic && !isPacketDone(packet) && normalizedStatus !== "discarded" && !hasActiveRuntimeInvocation(packet);
}

function canDiscardPacket(packet: SelfEvolutionPacket) {
  const normalizedStatus = packet.status?.trim().toLowerCase() ?? "";
  return !isLegacyReviewPacket(packet) && !packet.attic && !isPacketDone(packet) && normalizedStatus !== "discarded";
}

function isActiveReviewItem(packet: SelfEvolutionPacket) {
  const normalizedStatus = packet.status?.trim().toLowerCase() ?? "";
  return !isLegacyReviewPacket(packet) && !packet.attic && normalizedStatus !== "discarded" && normalizedStatus !== "done";
}

function packetStatusLabel(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/[\s_-]+/gu, "_") ?? "";
  if (!normalized || normalized === "review" || normalized === "needs_review") {
    return "Review";
  }
  if (normalized === "done") {
    return "Done";
  }
  if (normalized === "discarded") {
    return "Discarded";
  }
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatPacketValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function packetStatusBadgeTone(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/[\s_-]+/gu, "_") ?? "";
  if (normalized === "done" || normalized === "accepted") {
    return "accepted";
  }
  if (normalized === "discarded") {
    return "discarded";
  }
  return "needs_review";
}

function PacketStatusBadge({ status }: { status: string | null }) {
  return <StatusBadge status={packetStatusBadgeTone(status)}>{packetStatusLabel(status)}</StatusBadge>;
}

type PacketExecutionControlProps = {
  packet: SelfEvolutionPacket;
};

function PacketExecutionControl({ packet }: PacketExecutionControlProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    const initialAgentId = packet.runtimeInvocation?.selectedAgentId ?? DEFAULT_PACKET_AGENT_ID;
    return PACKET_RUNTIME_AGENT_OPTIONS.some((option) => option.id === initialAgentId) ? initialAgentId : DEFAULT_PACKET_AGENT_ID;
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedAgent = PACKET_RUNTIME_AGENT_OPTIONS.find((option) => option.id === selectedAgentId) ?? PACKET_RUNTIME_AGENT_OPTIONS[0];
  const currentReason = packet.runtimeInvocation?.selectedAgentId === selectedAgent.id && packet.runtimeInvocation.agentSelectionReason ? packet.runtimeInvocation.agentSelectionReason : packetRuntimeAgentReason(selectedAgent.id);
  const actionDisabled = Boolean(pending || !canTriggerPacketImplementation(packet));
  const canLaunch = canTriggerPacketImplementation(packet);
  const agentOptions = PACKET_RUNTIME_AGENT_OPTIONS.map((option) => ({ value: option.id, label: option.label }));

  async function submit() {
    if (actionDisabled) {
      return;
    }
    if (!window.confirm(`Launch ${selectedAgent.id} for ${packet.id} and create or reuse its implementation task?`)) {
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/self-evolution/improvements/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", improvementKey: packet.canonicalKey, agentId: selectedAgent.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; summary?: string; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setMessage(payload.summary ?? "Submitted");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="self-evolution-invocation-card">
      <p className="muted">{currentReason}</p>

      <div className="self-evolution-packet-links">
        {packet.runtimeInvocation?.obsidianTaskId ? (
          <a className="action-trigger" href={buildWorkTaskHref(packet.runtimeInvocation.obsidianTaskId)}>
            Implementation task
          </a>
        ) : (
          <span className="muted">Implementation task will be created or reused on launch.</span>
        )}
        <span className="muted">MC object: {packet.canonicalKey}</span>
      </div>

      {packet.runtimeInvocation ? <p className="muted">{invocationStateLabel(packet.runtimeInvocation)}</p> : null}
      {packet.runtimeInvocation?.error ? <p className="action-message">{packet.runtimeInvocation.error}</p> : null}

      {canLaunch ? (
        <div className="self-evolution-launch-control">
          <button type="button" className="action-trigger self-evolution-launch-button" disabled={actionDisabled} onClick={() => void submit()}>
            {pending ? "Launching..." : "Accept with"}
          </button>
          <CompactSelect value={selectedAgent.id} options={agentOptions} onChange={setSelectedAgentId} ariaLabel="Launch agent" className="self-evolution-agent-picker" />
        </div>
      ) : null}
      {message ? <p className="action-message">{message}</p> : null}
    </div>
  );
}

export function SelfEvolutionPanel({ selfEvolution, cronJob, selectedDate, selectedPacketId }: SelfEvolutionPanelProps) {
  const [selectedDocument, setSelectedDocument] = useState<ObsidianDocumentReference | null>(null);
  const [expandedPacketKey, setExpandedPacketKey] = useState<string | null>(null);

  const currentRun = useMemo(() => {
    if (selectedDate) {
      return selfEvolution.runs.find((run) => run.date === selectedDate) ?? null;
    }
    return selfEvolution.runs[0] ?? null;
  }, [selectedDate, selfEvolution.runs]);

  const visiblePackets = useMemo(() => {
    if (!selectedDate) {
      return selfEvolution.packets.filter(isActiveReviewItem);
    }
    const byKey = new Map<string, SelfEvolutionPacket>();
    for (const packet of currentRun?.packets ?? []) {
      byKey.set(packetKey(packet), packet);
    }
    for (const packet of selfEvolution.packets) {
      if (packet.date === selectedDate || packet.dates.includes(selectedDate)) {
        byKey.set(packetKey(packet), packet);
      }
    }
    return [...byKey.values()];
  }, [currentRun?.packets, selectedDate, selfEvolution.packets]);

  const linkedDocuments = useMemo(
    () => [
      ...selfEvolution.runs.map((run) => run.note),
      selfEvolution.links.latestNote,
      selfEvolution.links.index,
      selfEvolution.links.curriculum,
      selfEvolution.links.systemMap,
      selfEvolution.links.valuesModel,
      selfEvolution.links.evalCorpus,
    ].filter((document): document is ObsidianDocumentReference => Boolean(document)),
    [selfEvolution.links, selfEvolution.runs],
  );

  const reviewTask = currentRun?.reviewTask ?? (selfEvolution.reviewTaskId ? { id: selfEvolution.reviewTaskId, status: selfEvolution.reviewTaskStatus, title: null, detailsRef: null, resultsRef: null, wikiRef: null } : null);
  const mutatingActions = currentRun?.mutatingActions ?? selfEvolution.mutatingActions;
  const packetCount = currentRun?.packetCount ?? selfEvolution.packetCount;
  const gateStatus = currentRun?.allGatesOk ?? selfEvolution.allGatesOk;
  const currentDate = currentRun?.date ?? selfEvolution.latestDate;
  const currentGeneratedAt = currentRun?.generatedAt ?? selfEvolution.latestGeneratedAt;

  useEffect(() => {
    if (!selectedDocument) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedDocument(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDocument]);

  useEffect(() => {
    if (selectedPacketId) {
      const target = visiblePackets.find((packet) => packet.id === selectedPacketId);
      if (target) {
        setExpandedPacketKey(packetKey(target));
        return;
      }
    }
    if (selectedDate && visiblePackets.length > 0) {
      setExpandedPacketKey(packetKey(visiblePackets[0]));
    }
  }, [selectedDate, selectedPacketId, visiblePackets]);

  function openDocument(document: ObsidianDocumentReference | null) {
    if (!document?.exists) {
      return;
    }
    setSelectedDocument(document);
  }

  function togglePacket(packet: SelfEvolutionPacket) {
    const key = packetKey(packet);
    setExpandedPacketKey((current) => (current === key ? null : key));
  }

  function resolveInlineHref(token: string) {
    if (isTaskId(token)) {
      return buildWorkTaskHref(token);
    }
    if (isPacketId(token)) {
      const packet =
        (selectedDate ? selfEvolution.packets.find((item) => item.id === token && item.date === selectedDate) : null) ??
        currentRun?.packets.find((item) => item.id === token) ??
        selfEvolution.packets.find((item) => item.id === token);
      return packet ? buildSelfEvolutionDayHref(packet.date, packet.id) : null;
    }
    return null;
  }

  return (
    <>
      {selectedDate ? (
        <div className="self-evolution-filter-banner">
          <div>
            <strong>{formatDisplayDayDate(selectedDate)}</strong>
            <p className="muted">Focused day view for supervised self-evolution improvements.</p>
          </div>
          <a className="action-trigger" href="/ops">
            Show Ops
          </a>
          <a className="action-trigger" href="/self-evolution">
            Show all days
          </a>
        </div>
      ) : null}

      <section className="ops-grid">
        <div className="ops-field">
          <span>Review day</span>
          <strong>{currentDate ? formatDisplayDayDate(currentDate) : "none"}</strong>
          <small>{currentGeneratedAt ? `Generated ${formatDateTime(currentGeneratedAt)}` : "No Obsidian daily note found yet."}</small>
        </div>
        <div className="ops-field">
          <span>Gate status</span>
          <strong>{gateStatus == null ? "unknown" : gateStatus ? "PASS" : "FAIL"}</strong>
          <small>{packetCount} proposed improvement{packetCount === 1 ? "" : "s"}</small>
        </div>
        <div className="ops-field">
          <span>Review task</span>
          <strong>{reviewTask?.id ?? "none"}</strong>
          <small>{reviewTask ? `${reviewTask.status ?? "unknown"} · ${reviewTask.title ?? "Review task"}` : "No active review task found."}</small>
        </div>
        <div className="ops-field">
          <span>Production cron</span>
          <strong>{cronJob?.lastRunStatus ?? "none"}</strong>
          <small>
            Last {formatDateTime(cronJob?.lastRunAtMs ?? null)} · Next {formatDateTime(cronJob?.nextRunAtMs ?? null)}
          </small>
        </div>
      </section>

      <div className="action-row ops-action-row">
        {currentRun ? (
          <button type="button" className="metric-action" onClick={() => openDocument(currentRun.note)} disabled={!currentRun.note.exists}>
            Open day note
          </button>
        ) : null}
        {reviewTask ? (
          <a className="metric-action" href={buildWorkTaskHref(reviewTask.id)}>
            Open work task
          </a>
        ) : null}
        <details className="routing-details self-evolution-reference-details">
          <summary>Reference docs</summary>
          <div className="self-evolution-reference-actions">
            <button type="button" className="metric-action" onClick={() => openDocument(selfEvolution.links.index)} disabled={!selfEvolution.links.index.exists}>
              Review index
            </button>
            <button type="button" className="metric-action" onClick={() => openDocument(selfEvolution.links.systemMap)} disabled={!selfEvolution.links.systemMap.exists}>
              System map
            </button>
            <button type="button" className="metric-action" onClick={() => openDocument(selfEvolution.links.valuesModel)} disabled={!selfEvolution.links.valuesModel.exists}>
              Values model
            </button>
            <button type="button" className="metric-action" onClick={() => openDocument(selfEvolution.links.evalCorpus)} disabled={!selfEvolution.links.evalCorpus.exists}>
              Eval corpus
            </button>
            <button type="button" className="metric-action" onClick={() => openDocument(selfEvolution.links.curriculum)} disabled={!selfEvolution.links.curriculum.exists}>
              Curriculum
            </button>
          </div>
        </details>
      </div>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Domain</th>
              <th>Improvement</th>
              <th>Value</th>
              <th>Complexity</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePackets.map((packet) => {
              const key = packetKey(packet);
              const expanded = expandedPacketKey === key;
              const displayDate = selectedDate && packet.dates.includes(selectedDate) ? selectedDate : packet.date;
              const focused = selectedPacketId === packet.id || (selectedDate != null && packet.dates.includes(selectedDate));
              return (
                <Fragment key={key}>
                  <tr className={`meeting-row ${expanded ? "meeting-row-active" : ""} ${focused ? "self-evolution-row-focused" : ""}`}>
                    <td>
                      <a className="obsidian-inline-link" href={buildSelfEvolutionDayHref(displayDate, packet.id)}>
                        {packet.dates && packet.dates.length > 1 ? `${packet.dates.length} days · ${formatDisplayDayDate(displayDate)}` : formatDisplayDayDate(displayDate)}
                      </a>
                      {packet.dates.length > 1 ? <small className="muted">+{packet.dates.length - 1} linked day{packet.dates.length === 2 ? "" : "s"}</small> : null}
                    </td>
                    <td>{packet.domain}</td>
                    <td>
                      <button
                        type="button"
                        className="mynt-row-toggle"
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${packet.id}`}
                        onClick={() => togglePacket(packet)}
                      >
                        {expanded ? "-" : "+"}
                      </button>
                      <button type="button" className="ops-packet-trigger" aria-expanded={expanded} onClick={() => togglePacket(packet)}>
                        <span className="ops-packet-trigger-id">{packet.id}</span>
                        <span>{packet.title}</span>
                      </button>
                      {packet.summary && packet.summary !== packet.title ? <small className="muted">{packet.summary}</small> : null}
                    </td>
                    <td>{formatPacketValue(packet.value)}</td>
                    <td>{packet.complexity}</td>
                    <td>{packet.risk}</td>
                    <td>
                      <PacketStatusBadge status={packet.status} />
                    </td>
                    <td>{packet.owner}</td>
                    <td>
                      {canDiscardPacket(packet) ? (
                        <div className="self-evolution-inline-actions">
                          <ActionButton
                            endpoint="/api/self-evolution/improvements/action"
                            label="Discard"
                            confirmText={`Move ${packet.id} to the self-evolution attic?`}
                            body={{ action: "discard", improvementKey: packet.canonicalKey }}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="mynt-expanded-row">
                      <td colSpan={9}>
                        <div className="self-evolution-packet-detail">
                          <div className="self-evolution-packet-links">
                            <button type="button" className="action-trigger" onClick={() => openDocument(packet.note)} disabled={!packet.note.exists}>
                              Full daily note
                            </button>
                            {packet.document ? (
                              <button type="button" className="action-trigger" onClick={() => openDocument(packet.document)} disabled={!packet.document.exists}>
                                Improvement note
                              </button>
                            ) : null}
                            {packet.reviewTask ? (
                              <a className="action-trigger" href={buildWorkTaskHref(packet.reviewTask.id)}>
                                Open review task
                              </a>
                            ) : null}
                            <span className="muted">
                              Dedupe key: <code>{packet.dedupeKey ?? packet.canonicalKey}</code>
                            </span>
                          </div>
                          <dl className="self-evolution-improvement-fields">
                            <div>
                              <dt>Analyzer</dt>
                              <dd>{packet.analyzer ?? "unknown"}</dd>
                            </div>
                            <div>
                              <dt>Approval</dt>
                              <dd>{packet.approvalClass ?? packet.approvalClassification ?? "review"}</dd>
                            </div>
                            <div>
                              <dt>Rollback</dt>
                              <dd>{packet.rollback ?? "No rollback field recorded."}</dd>
                            </div>
                            <div>
                              <dt>Validation</dt>
                              <dd>{packet.validation.length > 0 ? packet.validation.join("; ") : "No validation field recorded."}</dd>
                            </div>
                            <div>
                              <dt>Evidence</dt>
                              <dd>{packet.evidence.length > 0 ? packet.evidence.join("; ") : "No evidence refs recorded."}</dd>
                            </div>
                          </dl>
                          {canTriggerPacketImplementation(packet) || packet.runtimeInvocation ? <PacketExecutionControl packet={packet} /> : null}
                          {packet.document?.markdown ? (
                            <ObsidianMarkdown markdown={packet.document.markdown} documents={linkedDocuments} onOpenDocument={openDocument} resolveInlineHref={resolveInlineHref} />
                          ) : (
                            <p className="muted">Improvement details were not found in this Obsidian review note.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {visiblePackets.length === 0 ? (
              <tr>
                <td colSpan={8}>{selectedDate ? "No proposed improvements were parsed for this day. Open the daily note for clean-state evidence." : "No proposed improvements parsed yet."}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Approved write</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {mutatingActions.map((action, index) => (
              <tr key={`${action.kind}-${index}`}>
                <td>{action.kind}</td>
                <td>{action.target}</td>
              </tr>
            ))}
            {mutatingActions.length === 0 ? (
              <tr>
                <td colSpan={2}>No approved write actions recorded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedDocument ? (
        <div className="task-modal-backdrop" onClick={() => setSelectedDocument(null)}>
          <div className="task-modal obsidian-document-modal" role="dialog" aria-modal="true" aria-labelledby="obsidian-document-title" onClick={(event) => event.stopPropagation()}>
            <div className="task-modal-header">
              <div className="task-modal-heading">
                <p className="task-card-id">{selectedDocument.vaultPath}</p>
                <h3 id="obsidian-document-title" className="meeting-transcript-title">
                  {selectedDocument.label}
                </h3>
                {selectedDocument.title !== selectedDocument.label ? <p className="muted">{selectedDocument.title}</p> : null}
              </div>
              <div className="task-modal-actions">
                <a className="action-trigger" href={selectedDocument.href}>
                  Open in Obsidian
                </a>
                <button type="button" className="task-modal-close" onClick={() => setSelectedDocument(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="task-modal-body">
              <section className="task-modal-section obsidian-document-section">
                {selectedDocument.markdown ? (
                  <ObsidianMarkdown markdown={selectedDocument.markdown} documents={linkedDocuments} onOpenDocument={openDocument} resolveInlineHref={resolveInlineHref} />
                ) : (
                  <p className="muted">No markdown content available.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
