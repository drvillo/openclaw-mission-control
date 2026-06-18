"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AssertionCard, ReviewStatusBadge, type AssertionReviewOperation } from "./assertion-card";
import { AssertionListLane } from "./assertion-list-lane";
import { AccountabilityGraphCanvas, type GraphNodeScreenPosition } from "./accountability-graph-canvas";
import { buildAccountabilityGraph, type AccountabilityGraph, type AccountabilityGraphLink, type AccountabilityGraphNode } from "../lib/accountability-graph";
import { formatDisplayDate } from "../lib/date-format";
import { normalizeMyAccountabilityActionStatus } from "../lib/my-accountability";
import type { MyntIndex, MyntItem, MyntPerson } from "../lib/mynt";

type AccountabilityGraphViewProps = {
  items: MyntItem[];
  people: MyntPerson[];
  identities: MyntIndex["identities"];
  pending: boolean;
  pendingReviewOnly: boolean;
  includeSelf?: boolean;
  selectedPersonId: string | null;
  onClose: () => void;
  onSelectPerson: (personId: string | null, options?: { updateUrl?: boolean }) => void;
  onReview: (operation: AssertionReviewOperation, item: MyntItem) => void;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onMarkDone: (item: MyntItem) => void;
  onAcceptPending?: (items: MyntItem[]) => void;
};

type GraphSelection = { type: "person"; personId: string } | { type: "assertion"; nodeId: string; itemId: string } | null;
type GraphPersonTab = "actions" | "decisions";
type GraphVisibility = {
  showActions: boolean;
  showDecisions: boolean;
  showDoneActions: boolean;
};
type GraphOverlayLayout =
  | { mode: "pending" }
  | { mode: "sheet" }
  | {
      mode: "anchored";
      left: number;
      top: number;
      width: number;
    };
type AssertionConnection = {
  person: Extract<AccountabilityGraphNode, { nodeType: "person" }>;
  link: AccountabilityGraphLink;
};
type SelectedGraphNodeOverlayProps = {
  selection: Exclude<GraphSelection, null>;
  layout: GraphOverlayLayout;
  title: string;
  summary: string;
  pending: boolean;
  identities: MyntIndex["identities"];
  personTab: GraphPersonTab;
  selectedActions: MyntItem[];
  selectedAssertionItem: MyntItem | null;
  selectedDecisions: MyntItem[];
  selectedPendingItems: MyntItem[];
  assertionConnectedPeople: AssertionConnection[];
  onClose: () => void;
  onAcceptPending?: (items: MyntItem[]) => void;
  onPersonTabChange: (tab: GraphPersonTab) => void;
  onReview: (operation: AssertionReviewOperation, item: MyntItem) => void;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onMarkDone: (item: MyntItem) => void;
  onSelectConnectedPerson: (person: Extract<AccountabilityGraphNode, { nodeType: "person" }>) => void;
};

const MOBILE_GRAPH_OVERLAY_BREAKPOINT = 960;
const GRAPH_OVERLAY_PADDING = 24;
const GRAPH_PERSON_OVERLAY_WIDTH = 720;
const GRAPH_ASSERTION_OVERLAY_WIDTH = 560;
const GRAPH_PERSON_OVERLAY_HEIGHT = 640;
const GRAPH_ASSERTION_OVERLAY_HEIGHT = 560;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pendingReviewItems(items: MyntItem[]) {
  return items.filter((item) => item.reviewStatus === "needs_review" && item.assertionId);
}

function actorKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function itemMatchesPerson(item: MyntItem, personId: string, identities: MyntIndex["identities"]) {
  if (item.person.id === personId || item.associations.some((association) => `identity:${association.identityId}` === personId)) {
    return true;
  }
  if (personId.startsWith("raw:")) {
    const rawKey = personId.replace(/^raw:/u, "");
    return item.meetingParticipants.some((participant) => actorKey(participant) === rawKey);
  }
  if (personId.startsWith("identity:")) {
    const identityId = personId.replace(/^identity:/u, "");
    const identity = identities.find((candidate) => candidate.id === identityId);
    if (!identity) {
      return false;
    }
    const keys = new Set([identity.email, identity.displayName, ...identity.aliases].filter(Boolean).map(actorKey));
    return item.meetingParticipants.some((participant) => keys.has(actorKey(participant)));
  }
  return false;
}

function selectedSummary(person: MyntPerson | null, relatedItems: MyntItem[]) {
  const pending = relatedItems.filter((item) => item.reviewStatus === "needs_review").length;
  if (relatedItems.length > 0 || !person) {
    const actions = relatedItems.filter((item) => item.kind === "action").length;
    const decisions = relatedItems.filter((item) => item.kind === "decision").length;
    return `${pluralize(actions, "action")} · ${pluralize(decisions, "decision")} · ${pluralize(pending, "pending item")}`;
  }
  return `${pluralize(person.actionCount, "action")} · ${pluralize(person.decisionCount, "decision")} · ${pluralize(pending, "pending item")}`;
}

function endpointId(endpoint: AccountabilityGraphLink["source"] | AccountabilityGraphLink["target"] | unknown) {
  if (typeof endpoint === "string" || typeof endpoint === "number") {
    return String(endpoint);
  }
  if (endpoint && typeof endpoint === "object" && "id" in endpoint) {
    const id = endpoint.id;
    return typeof id === "string" || typeof id === "number" ? String(id) : "";
  }
  return "";
}

function applyGraphVisibility(graph: AccountabilityGraph, items: MyntItem[], visibility: GraphVisibility): AccountabilityGraph {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const visibleAssertionIds = new Set<string>();

  for (const node of graph.nodes) {
    if (node.nodeType !== "assertion") {
      continue;
    }
    const item = itemsById.get(node.itemId);
    if (!item) {
      continue;
    }
    const visibleByKind = node.kind === "action" ? visibility.showActions : visibility.showDecisions;
    const visibleByActionStatus = node.kind !== "action" || visibility.showDoneActions || normalizeMyAccountabilityActionStatus(item.status) !== "done";
    if (visibleByKind && visibleByActionStatus) {
      visibleAssertionIds.add(node.id);
    }
  }

  const visiblePersonIds = new Set<string>();
  for (const link of graph.links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (visibleAssertionIds.has(source) && target.startsWith("person:")) {
      visiblePersonIds.add(target);
    }
    if (visibleAssertionIds.has(target) && source.startsWith("person:")) {
      visiblePersonIds.add(source);
    }
  }

  const visibleNodeIds = new Set([...visibleAssertionIds, ...visiblePersonIds]);
  const nodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  const links = graph.links.filter((link) => visibleNodeIds.has(endpointId(link.source)) && visibleNodeIds.has(endpointId(link.target)));
  const assertions = nodes.filter((node): node is Extract<AccountabilityGraphNode, { nodeType: "assertion" }> => node.nodeType === "assertion");

  return {
    nodes,
    links,
    stats: {
      people: nodes.filter((node) => node.nodeType === "person").length,
      assertions: assertions.length,
      actions: assertions.filter((node) => node.kind === "action").length,
      decisions: assertions.filter((node) => node.kind === "decision").length,
      pending: assertions.filter((node) => node.reviewStatus === "needs_review").length,
    },
  };
}

function buildGraphOverlayLayout(
  anchor: GraphNodeScreenPosition | null,
  selection: Exclude<GraphSelection, null>,
  viewportWidth: number,
): GraphOverlayLayout {
  if (viewportWidth > 0 && viewportWidth < MOBILE_GRAPH_OVERLAY_BREAKPOINT) {
    return { mode: "sheet" };
  }
  if (!anchor) {
    return { mode: "pending" };
  }
  if (!anchor.visible) {
    return { mode: "sheet" };
  }

  const width = selection.type === "person" ? GRAPH_PERSON_OVERLAY_WIDTH : GRAPH_ASSERTION_OVERLAY_WIDTH;
  const height = selection.type === "person" ? GRAPH_PERSON_OVERLAY_HEIGHT : GRAPH_ASSERTION_OVERLAY_HEIGHT;
  const availableWidth = anchor.viewportWidth - GRAPH_OVERLAY_PADDING * 2;
  const availableHeight = anchor.viewportHeight - GRAPH_OVERLAY_PADDING * 2;

  if (availableWidth < Math.min(width, 420) || availableHeight < 320) {
    return { mode: "sheet" };
  }

  const renderWidth = Math.min(width, availableWidth);
  const side = anchor.x <= anchor.viewportWidth / 2 || anchor.viewportWidth - anchor.x > renderWidth + 48 ? "right" : "left";
  const left =
    side === "right"
      ? clamp(anchor.x + 20, GRAPH_OVERLAY_PADDING, anchor.viewportWidth - renderWidth - GRAPH_OVERLAY_PADDING)
      : clamp(anchor.x - renderWidth - 20, GRAPH_OVERLAY_PADDING, anchor.viewportWidth - renderWidth - GRAPH_OVERLAY_PADDING);
  const top = clamp(anchor.y - 84, GRAPH_OVERLAY_PADDING, anchor.viewportHeight - Math.min(height, availableHeight) - GRAPH_OVERLAY_PADDING);

  return { mode: "anchored", left, top, width: renderWidth };
}

function SelectedGraphNodeOverlay({
  selection,
  layout,
  title,
  summary,
  pending,
  identities,
  personTab,
  selectedActions,
  selectedAssertionItem,
  selectedDecisions,
  selectedPendingItems,
  assertionConnectedPeople,
  onClose,
  onAcceptPending,
  onPersonTabChange,
  onReview,
  onReassign,
  onMarkDone,
  onSelectConnectedPerson,
}: SelectedGraphNodeOverlayProps) {
  const isPersonSelection = selection.type === "person";
  const overlayClassName = [
    "accountability-graph-selection-overlay",
    layout.mode === "sheet" ? "accountability-graph-selection-sheet" : "accountability-graph-selection-anchored",
    isPersonSelection ? "accountability-graph-selection-person" : "accountability-graph-selection-assertion",
  ].join(" ");
  const overlayStyle: (CSSProperties & Record<"--graph-selection-width", string>) | undefined =
    layout.mode === "anchored"
      ? {
          left: `${layout.left}px`,
          top: `${layout.top}px`,
          "--graph-selection-width": `${layout.width}px`,
        }
      : undefined;

  return (
    <section className={overlayClassName} style={overlayStyle} aria-label="Selected graph details">
      <header className="accountability-graph-selection-header">
        <div className="accountability-graph-selection-heading">
          <p className="eyebrow">{isPersonSelection ? "Person" : "Assertion"}</p>
          <h4>{title}</h4>
          <p>{summary}</p>
        </div>
        <div className="accountability-graph-selection-actions">
          {isPersonSelection && onAcceptPending ? (
            <button type="button" className="action-trigger" disabled={pending || selectedPendingItems.length === 0} onClick={() => onAcceptPending(selectedPendingItems)}>
              Accept pending
            </button>
          ) : null}
          <button type="button" className="meeting-review-action-button" onClick={onClose}>
            Close details
          </button>
        </div>
      </header>

      {isPersonSelection ? (
        <div className="accountability-graph-selection-body">
          <div className="my-accountability-tabs accountability-graph-node-tabs" role="tablist" aria-label={`${title} accountability sections`}>
            <button
              type="button"
              role="tab"
              aria-selected={personTab === "actions"}
              className={`my-accountability-tab ${personTab === "actions" ? "my-accountability-tab-active" : ""}`}
              onClick={() => onPersonTabChange("actions")}
            >
              Actions
              <span>{selectedActions.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={personTab === "decisions"}
              className={`my-accountability-tab ${personTab === "decisions" ? "my-accountability-tab-active" : ""}`}
              onClick={() => onPersonTabChange("decisions")}
            >
              Decisions
              <span>{selectedDecisions.length}</span>
            </button>
          </div>

          <div className="accountability-graph-detail-lanes accountability-graph-person-lanes" role="tabpanel">
            {personTab === "actions" ? (
              <AssertionListLane
                title="Actions"
                description="Assigned follow-ups for this person."
                emptyText="No actions for this graph selection."
                items={selectedActions}
                pending={pending}
                assigneeIdentities={identities}
                onReview={onReview}
                onReassign={onReassign}
                onMarkDone={onMarkDone}
              />
            ) : (
              <AssertionListLane
                title="Decisions"
                description="Owned decisions for this person."
                emptyText="No decisions for this graph selection."
                items={selectedDecisions}
                pending={pending}
                assigneeIdentities={identities}
                onReview={onReview}
              />
            )}
          </div>
        </div>
      ) : selectedAssertionItem ? (
        <div className="accountability-graph-selection-body">
          <div className="accountability-graph-detail-lanes accountability-graph-assertion-panel">
            <section className="accountability-graph-assertion-detail">
              <div className="meeting-review-title-row">
                <span className={`mynt-item-kind mynt-item-kind-${selectedAssertionItem.kind}`}>
                  {selectedAssertionItem.kind === "action" ? "Action" : "Decision"}
                </span>
                <ReviewStatusBadge status={selectedAssertionItem.reviewStatus} />
              </div>
              <p>{selectedAssertionItem.summary}</p>
              <div className="meeting-review-meta">
                <span className="meeting-review-meta-item">
                  <span>Owner</span>
                  <strong>{selectedAssertionItem.person.displayName}</strong>
                </span>
                <span className="meeting-review-meta-item">
                  <span>Meeting</span>
                  <strong>{selectedAssertionItem.meetingTitle}</strong>
                </span>
                <span className="meeting-review-meta-item">
                  <span>Date</span>
                  <strong>{formatDisplayDate(selectedAssertionItem.meetingDate)}</strong>
                </span>
                {selectedAssertionItem.kind === "action" ? (
                  <span className="meeting-review-meta-item">
                    <span>Action status</span>
                    <strong>{normalizeMyAccountabilityActionStatus(selectedAssertionItem.status).replace(/_/gu, " ")}</strong>
                  </span>
                ) : null}
              </div>
              <AssertionCard
                item={selectedAssertionItem}
                pending={pending}
                onReview={onReview}
                onReassign={onReassign}
                onMarkDone={onMarkDone}
                assigneeIdentities={identities}
                showPerson
              />
            </section>

            <section className="mynt-lane">
              <header className="mynt-lane-header">
                <div>
                  <h4>Connected People</h4>
                  <p>Relationships currently visible around this assertion.</p>
                </div>
                <span className="mynt-lane-count">{assertionConnectedPeople.length}</span>
              </header>
              <div className="accountability-graph-relationships">
                {assertionConnectedPeople.map(({ person, link }) => (
                  <button type="button" key={`${link.id}:${person.id}`} className="accountability-graph-relationship" onClick={() => onSelectConnectedPerson(person)}>
                    <strong>{person.displayName}</strong>
                    <span>{link.label}</span>
                  </button>
                ))}
                {assertionConnectedPeople.length === 0 ? <div className="mynt-lane-empty">No connected people visible for this assertion.</div> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AccountabilityGraphView({
  items,
  people,
  identities,
  pending,
  pendingReviewOnly,
  includeSelf = false,
  selectedPersonId,
  onClose,
  onSelectPerson,
  onReview,
  onReassign,
  onMarkDone,
  onAcceptPending,
}: AccountabilityGraphViewProps) {
  const [hoveredNode, setHoveredNode] = useState<AccountabilityGraphNode | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [unpinSelectedSignal, setUnpinSelectedSignal] = useState(0);
  const [unpinAllSignal, setUnpinAllSignal] = useState(0);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<GraphSelection>(selectedPersonId ? { type: "person", personId: selectedPersonId } : null);
  const [personTab, setPersonTab] = useState<GraphPersonTab>("actions");
  const [selectionAnchor, setSelectionAnchor] = useState<GraphNodeScreenPosition | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [visibility, setVisibility] = useState<GraphVisibility>({ showActions: true, showDecisions: true, showDoneActions: false });

  const baseGraph = useMemo(() => buildAccountabilityGraph(items, { identities, includeSelf, pendingReviewOnly }), [identities, includeSelf, items, pendingReviewOnly]);
  const graph = useMemo(() => applyGraphVisibility(baseGraph, items, visibility), [baseGraph, items, visibility]);
  const selectedAssertionNode = useMemo(
    () =>
      selection?.type === "assertion"
        ? graph.nodes.find((node): node is Extract<AccountabilityGraphNode, { nodeType: "assertion" }> => node.nodeType === "assertion" && node.id === selection.nodeId) || null
        : null,
    [graph.nodes, selection],
  );
  const selectedAssertionItem = useMemo(
    () => (selection?.type === "assertion" ? items.find((item) => item.id === selection.itemId) || null : null),
    [items, selection],
  );
  const activePersonId = selection?.type === "person" ? selection.personId : null;
  const selectedPerson = useMemo(() => people.find((person) => person.id === activePersonId) || null, [activePersonId, people]);
  const selectedGraphPerson = useMemo(
    () => graph.nodes.find((node): node is Extract<AccountabilityGraphNode, { nodeType: "person" }> => node.nodeType === "person" && node.personId === activePersonId) || null,
    [activePersonId, graph.nodes],
  );
  const visibleItemIds = useMemo(
    () => new Set(graph.nodes.filter((node): node is Extract<AccountabilityGraphNode, { nodeType: "assertion" }> => node.nodeType === "assertion").map((node) => node.itemId)),
    [graph.nodes],
  );
  const selectedRelatedItems = useMemo(() => {
    if (!activePersonId) {
      return [];
    }
    return items.filter((item) => visibleItemIds.has(item.id) && itemMatchesPerson(item, activePersonId, identities));
  }, [activePersonId, identities, items, visibleItemIds]);
  const selectedActions = selectedRelatedItems.filter((item) => item.kind === "action");
  const selectedDecisions = selectedRelatedItems.filter((item) => item.kind === "decision");
  const selectedNodeId = selection?.type === "person" ? `person:${selection.personId}` : selection?.nodeId ?? null;
  const selectedDisplayName =
    selection?.type === "assertion"
      ? selectedAssertionItem?.summary ?? selectedAssertionNode?.summary ?? "Assertion"
      : selectedPerson?.displayName ?? selectedGraphPerson?.displayName ?? "No person selected";
  const selectedOverlaySummary =
    selection?.type === "assertion" && selectedAssertionItem
      ? `${selectedAssertionItem.kind === "action" ? "Action" : "Decision"} · ${selectedAssertionItem.person.displayName} · ${formatDisplayDate(selectedAssertionItem.meetingDate)}`
      : selectedSummary(selectedPerson, selectedRelatedItems);
  const hasSelection = Boolean(selection);
  const selectedPendingItems = pendingReviewItems([...selectedActions, ...selectedDecisions]);
  const assertionConnectedPeople = useMemo(() => {
    if (!selectedAssertionNode) {
      return [];
    }
    return graph.links
      .filter((link) => endpointId(link.source) === selectedAssertionNode.id || endpointId(link.target) === selectedAssertionNode.id)
      .map((link) => {
        const source = endpointId(link.source);
        const target = endpointId(link.target);
        const personId = source === selectedAssertionNode.id ? target : source;
        const personNode = graph.nodes.find((node): node is Extract<AccountabilityGraphNode, { nodeType: "person" }> => node.nodeType === "person" && node.id === personId);
        return personNode ? { person: personNode, link } : null;
      })
      .filter((entry): entry is AssertionConnection => Boolean(entry));
  }, [graph.links, graph.nodes, selectedAssertionNode]);
  const overlayLayout = useMemo(
    () => (selection ? buildGraphOverlayLayout(selectionAnchor, selection, viewportWidth) : null),
    [selection, selectionAnchor, viewportWidth],
  );

  useEffect(() => {
    if (selectedPersonId) {
      setSelection((current) => (current?.type === "assertion" ? current : { type: "person", personId: selectedPersonId }));
      return;
    }
    setSelection((current) => (current?.type === "person" ? null : current));
  }, [selectedPersonId]);

  useEffect(() => {
    if (selection?.type === "assertion" && !graph.nodes.some((node) => node.id === selection.nodeId)) {
      setSelection(null);
    }
    if (selection?.type === "person" && !graph.nodes.some((node) => node.id === `person:${selection.personId}`)) {
      setSelection(null);
      onSelectPerson(null, { updateUrl: false });
    }
  }, [graph.nodes, onSelectPerson, selection]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [onClose]);

  function selectGraphNode(node: AccountabilityGraphNode, anchor: GraphNodeScreenPosition | null = null) {
    setSelectionAnchor(anchor);
    if (node.nodeType === "person") {
      setSelection({ type: "person", personId: node.personId });
      onSelectPerson(node.personId);
      return;
    }
    setSelection({ type: "assertion", nodeId: node.id, itemId: node.itemId });
  }

  function clearSelection() {
    setSelectionAnchor(null);
    setSelection(null);
    onSelectPerson(null);
  }

  function toggleVisibility(key: keyof GraphVisibility) {
    setVisibility((current) => ({ ...current, [key]: !current[key] }));
  }

  const hoverCopy = hoveredNode
    ? hoveredNode.nodeType === "person"
      ? `${hoveredNode.displayName} · ${pluralize(hoveredNode.actionCount, "action")} · ${pluralize(hoveredNode.decisionCount, "decision")}`
      : `${hoveredNode.kind === "action" ? "Action" : "Decision"}: ${hoveredNode.summary}`
    : "Drag to orbit, scroll to zoom, click a node to inspect.";

  return (
    <div className="accountability-graph-view" role="dialog" aria-modal="true" aria-labelledby="accountability-graph-title">
      <div className="accountability-graph-stage">
        <AccountabilityGraphCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          resetSignal={resetSignal}
          unpinSelectedSignal={unpinSelectedSignal}
          unpinAllSignal={unpinAllSignal}
          onPinnedNodeIdsChange={setPinnedNodeIds}
          onNodeSelect={selectGraphNode}
          onNodeHover={setHoveredNode}
          onBackgroundClick={clearSelection}
          onSelectionAnchorChange={setSelectionAnchor}
        />

        <div className="accountability-graph-controls" aria-label="Graph controls">
          <button type="button" className="action-trigger" onClick={() => setResetSignal((current) => current + 1)}>
            Reset camera
          </button>
          <button type="button" className="meeting-review-action-button" disabled={!selectedNodeId || !pinnedNodeIds.includes(selectedNodeId)} onClick={() => setUnpinSelectedSignal((current) => current + 1)}>
            Unpin selected
          </button>
          <button type="button" className="meeting-review-action-button" disabled={pinnedNodeIds.length === 0} onClick={() => setUnpinAllSignal((current) => current + 1)}>
            Unpin all
          </button>
          <button type="button" className="task-modal-close" onClick={onClose}>
            Close graph
          </button>
        </div>

        <section className="accountability-graph-global-panel">
          <div className="accountability-graph-global-head">
            <h3 id="accountability-graph-title">3D Accountability Graph</h3>
            <p>{hoverCopy}</p>
          </div>

          <div className="accountability-graph-stats" aria-label="Graph summary">
            <span>{pluralize(graph.stats.people, "person", "people")}</span>
            <span>{pluralize(graph.stats.actions, "action")}</span>
            <span>{pluralize(graph.stats.decisions, "decision")}</span>
            <span>{pluralize(graph.stats.pending, "pending")}</span>
          </div>

          <div className="accountability-graph-legend" aria-label="Graph legend">
            <span><i className="graph-dot graph-dot-owner" /> Owner</span>
            <button type="button" className={!visibility.showActions ? "accountability-graph-legend-muted" : ""} aria-pressed={visibility.showActions} onClick={() => toggleVisibility("showActions")}>
              <i className="graph-dot graph-dot-action" /> Action
            </button>
            <button type="button" className={!visibility.showDecisions ? "accountability-graph-legend-muted" : ""} aria-pressed={visibility.showDecisions} onClick={() => toggleVisibility("showDecisions")}>
              <i className="graph-dot graph-dot-decision" /> Decision
            </button>
            <span><i className="graph-dot graph-dot-unresolved" /> Unresolved identity</span>
            <label className="accountability-graph-toggle">
              <input type="checkbox" checked={visibility.showDoneActions} onChange={() => toggleVisibility("showDoneActions")} />
              All actions
            </label>
          </div>
        </section>

        {hasSelection && selection && overlayLayout && overlayLayout.mode !== "pending" ? (
          <SelectedGraphNodeOverlay
            selection={selection}
            layout={overlayLayout}
            title={selectedDisplayName}
            summary={selectedOverlaySummary}
            pending={pending}
            identities={identities}
            personTab={personTab}
            selectedActions={selectedActions}
            selectedAssertionItem={selectedAssertionItem}
            selectedDecisions={selectedDecisions}
            selectedPendingItems={selectedPendingItems}
            assertionConnectedPeople={assertionConnectedPeople}
            onClose={clearSelection}
            onAcceptPending={onAcceptPending}
            onPersonTabChange={setPersonTab}
            onReview={onReview}
            onReassign={onReassign}
            onMarkDone={onMarkDone}
            onSelectConnectedPerson={(person) => selectGraphNode(person)}
          />
        ) : null}
      </div>
    </div>
  );
}
