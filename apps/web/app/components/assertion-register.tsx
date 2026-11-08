"use client";

import { useMemo, useState } from "react";
import { AccountabilityGraphView } from "./accountability-graph-view";
import { ActionReassignControl } from "./action-reassign-control";
import { AssertionActionControls } from "./assertion-action-controls";
import { ConceptBadge } from "./assertion-card";
import { SearchControl } from "./search-control";
import {
  applyActionDoneToItems,
  applyMyntReassignment,
  applyReviewToItems,
  assertionActionKey,
  useAssertionActions,
} from "./use-assertion-actions";
import { useUrlSearchQuery } from "./use-url-search-query";
import { formatDisplayDate } from "../lib/date-format";
import { meetingReviewPayloadItems } from "../lib/meeting-review-client";
import { normalizeMyAccountabilityActionStatus } from "../lib/my-accountability";
import type { MyntIndex, MyntItem, MyntPerson } from "../lib/mynt";
import { itemMatchesSearch } from "../lib/search";

export type AssertionStatusFilter = "all" | "accepted" | "pending";

type AssertionRegisterProps = {
  index: MyntIndex;
  kind: "action" | "decision";
  statusFilter: AssertionStatusFilter;
};

type ReviewOperation = "accept" | "reject";
type ViewMode = "table" | "graph";

const FILTERS: { id: AssertionStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "accepted", label: "Accepted" },
  { id: "pending", label: "Pending review" },
];

function kindLabel(kind: AssertionRegisterProps["kind"]) {
  return kind === "action" ? "Actions" : "Decisions";
}

function singularKindLabel(kind: AssertionRegisterProps["kind"]) {
  return kind === "action" ? "Action" : "Decision";
}

function statusLabel(status: MyntItem["reviewStatus"]) {
  return status === "accepted" ? "Accepted" : "Needs Review";
}

function statusMatches(item: MyntItem, statusFilter: AssertionStatusFilter) {
  if (statusFilter === "accepted") {
    return item.reviewStatus === "accepted";
  }
  if (statusFilter === "pending") {
    return item.reviewStatus === "needs_review";
  }
  return item.reviewStatus === "accepted" || item.reviewStatus === "needs_review";
}

function rowKey(item: MyntItem) {
  return `${item.kind}:${item.assertionId ?? item.id}`;
}

function canMarkActionDone(item: MyntItem) {
  return item.kind === "action" && normalizeMyAccountabilityActionStatus(item.status) !== "done";
}

function buildPeople(items: MyntItem[]) {
  const map = new Map<string, MyntPerson>();
  for (const item of items) {
    const current = map.get(item.person.id) || {
      ...item.person,
      actionCount: 0,
      decisionCount: 0,
      totalCount: 0,
      actions: [],
      decisions: [],
    };
    if (item.kind === "action") {
      current.actionCount += 1;
      current.actions.push(item);
    } else {
      current.decisionCount += 1;
      current.decisions.push(item);
    }
    current.totalCount += 1;
    map.set(current.id, current);
  }
  return [...map.values()].sort(
    (left, right) =>
      right.totalCount - left.totalCount ||
      right.actionCount - left.actionCount ||
      left.displayName.localeCompare(right.displayName),
  );
}

export function AssertionRegister({ index, kind, statusFilter }: AssertionRegisterProps) {
  const [allItems, setAllItems] = useState(index.items);
  const [pendingReviewVisibleKeys] = useState(() => new Set(index.items.filter((item) => item.reviewStatus === "needs_review").map(assertionActionKey)));
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useUrlSearchQuery();
  const assertionActions = useAssertionActions();

  const items = useMemo(
    () =>
      allItems
        .filter(
          (item) =>
            item.kind === kind &&
            !item.archived &&
            (statusFilter !== "pending" || item.reviewStatus === "needs_review" || pendingReviewVisibleKeys.has(assertionActionKey(item))) &&
            (statusFilter === "pending" || statusMatches(item, statusFilter)),
        )
        .filter((item) => itemMatchesSearch(item, search))
        .sort((left, right) => right.meetingDate.localeCompare(left.meetingDate) || left.person.displayName.localeCompare(right.person.displayName)),
    [allItems, kind, pendingReviewVisibleKeys, search, statusFilter],
  );
  const selectedItems = items.filter((item) => selectedIds.includes(rowKey(item)));
  const selectedReviewItems = selectedItems.filter((item) => item.reviewStatus === "needs_review");
  const selectedMarkDoneItems = selectedItems.filter(canMarkActionDone);
  const reviewableItems = items.filter((item) => item.reviewStatus === "needs_review");
  const graphPeople = useMemo(() => buildPeople(items), [items]);
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  const basePath = `/accountability/${kind === "action" ? "actions" : "decisions"}`;

  async function postJson(endpoint: string, body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; summary?: string; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
      }
      setMessage(payload.summary ?? "Action completed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function postReview(operation: ReviewOperation, reviewItems: MyntItem[]) {
    setMessage(null);
    void assertionActions.reviewItems(operation, reviewItems, {
      pendingOnly: true,
      emptyMessage: "No selected pending review items with assertion IDs.",
      onSuccess: (_payload, payloadItems) => {
        setAllItems((current) => applyReviewToItems(current, operation, payloadItems));
        setSelectedIds((current) =>
          operation === "reject"
            ? current.filter((id) => !payloadItems.some((payloadItem) => id === `${payloadItem.kind}:${payloadItem.assertionId}`))
            : current,
        );
      },
      onMessage: reviewItems.length > 1 ? setMessage : undefined,
    });
  }

  async function markActionsDone(actionItems: MyntItem[]) {
    const assertionIds = actionItems
      .filter((item) => canMarkActionDone(item) && Boolean(item.assertionId))
      .map((item) => item.assertionId as string);
    if (assertionIds.length === 0) {
      setMessage("No selected non-done actions with assertion IDs.");
      return;
    }
    setMessage(null);
    void Promise.all(
      actionItems
        .filter((item) => canMarkActionDone(item) && Boolean(item.assertionId))
        .map((item) =>
          assertionActions.markActionDone(item, {
            onSuccess: () => setAllItems((current) => applyActionDoneToItems(current, [item.assertionId as string])),
          }),
        ),
    ).then((results) => {
      if (assertionIds.length > 1 && results.every(Boolean)) {
        setMessage(`Marked ${assertionIds.length} actions done.`);
      }
    });
  }

  function reassignAction(assertionId: string, assignee: string) {
    return postReassign(assertionId, assignee);
  }

  function reviewItem(operation: ReviewOperation, item: MyntItem) {
    postReview(operation, [item]);
  }

  function selectPerson(personId: string | null) {
    setSelectedPersonId(personId);
  }

  async function postReassign(assertionId: string, assignee: string) {
    setMessage(null);
    return assertionActions.reassignAction(assertionId, assignee, {
      onSuccess: (payload) => {
        setAllItems((current) => applyMyntReassignment(current, assertionId, payload.assignee ?? assignee, index.identities));
        setReassigningId(null);
      },
    });
  }

  function archiveOlderThan30() {
    if (index.archivePreview.itemCount === 0) {
      setMessage("No Accountability Map items older than 30 days to archive.");
      return;
    }
    const preview = index.archivePreview;
    const ok = window.confirm(
      `Archive ${preview.itemCount} Accountability Map items across ${preview.peopleAffected} people and move ${preview.linkedTaskCount} linked Fathom tasks to attic?`,
    );
    if (ok) {
      void postJson("/api/mynt/archive-older-than", { olderThanDays: 30, apply: true });
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : items.map(rowKey));
  }

  return (
    <div className="pending-review-register">
      <nav className="assertion-filter-tabs" aria-label={`${kindLabel(kind)} status filters`}>
        {FILTERS.map((filter) => (
          <a
            key={filter.id}
            href={`${basePath}/${filter.id}`}
            className={`assertion-filter-tab ${statusFilter === filter.id ? "assertion-filter-tab-active" : ""}`}
            aria-current={statusFilter === filter.id ? "page" : undefined}
          >
            {filter.label}
          </a>
        ))}
      </nav>

      <div className="mynt-toolbar pending-review-toolbar">
        <SearchControl
          value={search}
          onChange={setSearch}
          placeholder={`Search ${kindLabel(kind).toLowerCase()}`}
          resultSummary={`${items.length} visible`}
        />
        <button type="button" className="action-trigger" onClick={archiveOlderThan30} disabled={pending}>
          Archive older than 30 days
        </button>
        <button type="button" className="action-trigger" onClick={() => postReview("accept", reviewableItems)} disabled={pending || reviewableItems.length === 0}>
          Accept all pending
        </button>
        <button type="button" className="action-trigger" onClick={() => postReview("accept", selectedReviewItems)} disabled={pending || selectedReviewItems.length === 0}>
          Accept selected
        </button>
        {kind === "action" ? (
          <button type="button" className="action-trigger" onClick={() => void markActionsDone(selectedMarkDoneItems)} disabled={pending || selectedMarkDoneItems.length === 0}>
            Mark selected done
          </button>
        ) : null}
        <button type="button" className="meeting-review-action-button meeting-review-action-danger" onClick={() => postReview("reject", reviewableItems)} disabled={pending || reviewableItems.length === 0}>
          Reject all pending
        </button>
        <button type="button" className="meeting-review-action-button meeting-review-action-danger" onClick={() => postReview("reject", selectedReviewItems)} disabled={pending || selectedReviewItems.length === 0}>
          Reject selected
        </button>
        <span className="muted">
          {selectedItems.length} selected of {items.length} {kindLabel(kind).toLowerCase()}
        </span>
        <div className="mynt-view-toggle" role="group" aria-label={`${kindLabel(kind)} view mode`}>
          <button type="button" className={viewMode === "table" ? "mynt-view-toggle-active" : ""} onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"}>
            Table
          </button>
          <button type="button" className={viewMode === "graph" ? "mynt-view-toggle-active" : ""} onClick={() => setViewMode("graph")} aria-pressed={viewMode === "graph"}>
            Accountability Graph
          </button>
        </div>
      </div>
      {message ? <p className="action-message mynt-message">{message}</p> : null}

      {viewMode === "graph" ? (
        <AccountabilityGraphView
          items={items}
          people={graphPeople}
          identities={index.identities}
          pending={pending}
          pendingReviewOnly={statusFilter === "pending"}
          includeSelf
          searchValue={search}
          searchResultSummary={`${items.length} visible`}
          selectedPersonId={selectedPersonId}
          onSearchChange={setSearch}
          onClose={() => setViewMode("table")}
          onSelectPerson={selectPerson}
          onReview={reviewItem}
          onReassign={reassignAction}
          onMarkDone={(item) => void markActionsDone([item])}
          getActionState={assertionActions.getActionState}
          onAcceptPending={(pendingItems) => postReview("accept", pendingItems)}
        />
      ) : (
      <div className="table-shell pending-review-table">
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={`Select all ${kindLabel(kind).toLowerCase()}`} />
              </th>
              <th>{singularKindLabel(kind)}</th>
              <th>Person</th>
              <th>Meeting</th>
              <th>Date</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const itemKey = rowKey(item);
              return (
                <tr key={itemKey}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(itemKey)} onChange={() => toggleSelected(itemKey)} aria-label={`Select ${item.summary}`} />
                  </td>
                  <td>
                    <strong>{item.summary}</strong>
                    <div className="assertion-register-row-meta">
                      <ConceptBadge item={item} />
                    </div>
                  </td>
                  <td>{item.person.displayName}</td>
                  <td>
                    <a href={`/meetings/${encodeURIComponent(item.meetingId)}/items/${encodeURIComponent(item.id)}`}>
                      {item.meetingTitle}
                    </a>
                  </td>
                  <td>{formatDisplayDate(item.meetingDate)}</td>
                  <td>
                    <span className={`meeting-review-status meeting-review-status-${item.reviewStatus}`}>
                      {statusLabel(item.reviewStatus)}
                    </span>
                  </td>
                  <td>
                    <div className="pending-review-row-actions">
                      <AssertionActionControls
                        item={item}
                        actionState={{ ...assertionActions.getActionState(item), pending: pending || assertionActions.getActionState(item).pending }}
                        reassignOpen={reassigningId === itemKey}
                        acceptLabel="Accept"
                        onReview={(operation, reviewItem) => postReview(operation, [reviewItem])}
                        onMarkDone={kind === "action" ? (actionItem) => void markActionsDone([actionItem]) : undefined}
                      />
                      {kind === "action" ? (
                        <ActionReassignControl
                          assertionId={item.assertionId}
                          currentAssignee={item.person.raw}
                          meetingParticipants={item.meetingParticipants}
                          identities={index.identities}
                          pending={pending || assertionActions.getActionState(item).pending}
                          onReassign={reassignAction}
                          onOpenChange={(open) => setReassigningId(open ? itemKey : null)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7}>No {kindLabel(kind).toLowerCase()} in this view.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
