"use client";

import { useMemo, useState } from "react";
import { ActionReassignControl } from "./action-reassign-control";
import { formatDisplayDate } from "../lib/date-format";
import {
  meetingReviewPayloadItems,
  postMeetingReview,
  type MeetingReviewPayloadItem,
  type ReassignActionPayload,
} from "../lib/meeting-review-client";
import type { MyntIndex, MyntItem } from "../lib/mynt";

export type AssertionStatusFilter = "all" | "accepted" | "pending";

type AssertionRegisterProps = {
  index: MyntIndex;
  kind: "action" | "decision";
  statusFilter: AssertionStatusFilter;
};

type ReviewOperation = "accept" | "reject";

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

export function AssertionRegister({ index, kind, statusFilter }: AssertionRegisterProps) {
  const [allItems, setAllItems] = useState(index.items);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const items = useMemo(
    () =>
      allItems
        .filter((item) => item.kind === kind && !item.archived && statusMatches(item, statusFilter))
        .sort((left, right) => right.meetingDate.localeCompare(left.meetingDate) || left.person.displayName.localeCompare(right.person.displayName)),
    [allItems, kind, statusFilter],
  );
  const selectedItems = items.filter((item) => selectedIds.includes(rowKey(item)));
  const selectedReviewItems = selectedItems.filter((item) => item.reviewStatus === "needs_review");
  const reviewableItems = items.filter((item) => item.reviewStatus === "needs_review");
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
    const payloadItems = meetingReviewPayloadItems(reviewItems, { pendingOnly: true });
    if (payloadItems.length === 0) {
      setMessage("No selected pending review items with assertion IDs.");
      return;
    }
    if (operation === "reject" && !window.confirm(`Reject and delete ${payloadItems.length} pending ${kind}${payloadItems.length === 1 ? "" : "s"}?`)) {
      return;
    }
    void postReviewItems(operation, payloadItems);
  }

  async function postReviewItems(operation: ReviewOperation, payloadItems: MeetingReviewPayloadItem[]) {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postMeetingReview({ operation, items: payloadItems });
      setMessage(payload.summary);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function reassignAction(assertionId: string, assignee: string) {
    return postReassign(assertionId, assignee);
  }

  async function postReassign(assertionId: string, assignee: string) {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postMeetingReview({ operation: "reassign_action", assertionId, assignee });
      const reassignPayload = payload.payload as ReassignActionPayload | undefined;
      if (reassignPayload?.reassigned !== 1 || !reassignPayload.assignee) {
        setMessage(payload.summary || "No action was reassigned.");
        return false;
      }
      setAllItems((current) =>
        current.map((item) =>
          item.kind === "action" && item.assertionId === assertionId
            ? {
                ...item,
                person: {
                  ...item.person,
                  displayName: reassignPayload.assignee ?? assignee,
                  raw: reassignPayload.assignee ?? assignee,
                },
              }
            : item,
        ),
      );
      setReassigningId(null);
      setMessage(payload.summary);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(false);
    }
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
        <button type="button" className="action-trigger" onClick={archiveOlderThan30} disabled={pending}>
          Archive older than 30 days
        </button>
        <button type="button" className="action-trigger" onClick={() => postReview("accept", reviewableItems)} disabled={pending || reviewableItems.length === 0}>
          Accept all pending
        </button>
        <button type="button" className="action-trigger" onClick={() => postReview("accept", selectedReviewItems)} disabled={pending || selectedReviewItems.length === 0}>
          Accept selected
        </button>
        <button type="button" className="meeting-review-action-button meeting-review-action-danger" onClick={() => postReview("reject", reviewableItems)} disabled={pending || reviewableItems.length === 0}>
          Reject all pending
        </button>
        <button type="button" className="meeting-review-action-button meeting-review-action-danger" onClick={() => postReview("reject", selectedReviewItems)} disabled={pending || selectedReviewItems.length === 0}>
          Reject selected
        </button>
        <span className="muted">
          {selectedItems.length} selected of {items.length} {kindLabel(kind).toLowerCase()}
        </span>
      </div>
      {message ? <p className="action-message mynt-message">{message}</p> : null}

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
                      {item.reviewStatus === "needs_review" && reassigningId !== itemKey ? (
                        <>
                          <button type="button" className="meeting-review-action-button" disabled={pending || !item.assertionId} onClick={() => postReview("accept", [item])}>
                            Accept
                          </button>
                          <button type="button" className="meeting-review-action-button meeting-review-action-danger" disabled={pending || !item.assertionId} onClick={() => postReview("reject", [item])}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {kind === "action" ? (
                        <ActionReassignControl
                          assertionId={item.assertionId}
                          currentAssignee={item.person.raw}
                          meetingParticipants={item.meetingParticipants}
                          identities={index.identities}
                          pending={pending}
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
    </div>
  );
}
