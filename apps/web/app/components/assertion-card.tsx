"use client";

import { useState } from "react";
import { ActionReassignControl } from "./action-reassign-control";
import { AppLink } from "./app-link";
import { formatDisplayDate } from "../lib/date-format";
import { normalizeMyAccountabilityActionStatus, type MyAccountabilityActionStatus } from "../lib/my-accountability";
import type { MyntIndex, MyntItem } from "../lib/mynt";

export type AssertionReviewOperation = "accept" | "reject";

type AssertionCardProps = {
  item: MyntItem;
  pending: boolean;
  assigneeIdentities: MyntIndex["identities"];
  showPerson?: boolean;
  showActionWorkflow?: boolean;
  onReview?: (operation: AssertionReviewOperation, item: MyntItem) => void;
  onReassign?: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onActionStatusChange?: (item: MyntItem, status: MyAccountabilityActionStatus) => void;
  onMarkDone?: (item: MyntItem) => void;
};

const ACTION_STATUS_OPTIONS: Array<{ id: MyAccountabilityActionStatus; label: string }> = [
  { id: "todo", label: "To do" },
  { id: "next", label: "Next" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export function reviewStatusLabel(status: MyntItem["reviewStatus"]) {
  return status === "accepted" ? "Accepted" : "Needs Review";
}

export function ReviewStatusBadge({ status }: { status: MyntItem["reviewStatus"] }) {
  return (
    <span className={`meeting-review-status meeting-review-status-${status}`}>
      {reviewStatusLabel(status)}
    </span>
  );
}

export function displayRawItemStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/gu, "_") ?? "";
  return normalized === "needs_review" || normalized === "accepted" ? null : status;
}

export function AssertionCard({
  item,
  pending,
  assigneeIdentities,
  showPerson = false,
  showActionWorkflow = false,
  onReview,
  onReassign,
  onActionStatusChange,
  onMarkDone,
}: AssertionCardProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const rawStatus = displayRawItemStatus(item.status);
  const canReview = item.reviewStatus === "needs_review" && !reassignOpen && onReview;
  const canReassign = item.kind === "action" && onReassign;
  const canUseWorkflow = item.kind === "action" && showActionWorkflow;
  const canMarkDone = item.kind === "action" && onMarkDone && normalizeMyAccountabilityActionStatus(item.status) !== "done";

  return (
    <article className="mynt-item-card">
      <div className="mynt-item-card-header">
        <div className="meeting-review-title-row">
          <span className={`mynt-item-kind mynt-item-kind-${item.kind}`}>
            {item.kind === "action" ? "Action" : "Decision"}
          </span>
          <ReviewStatusBadge status={item.reviewStatus} />
        </div>
        <time dateTime={item.meetingDate}>{formatDisplayDate(item.meetingDate)}</time>
      </div>
      <p>{item.summary}</p>
      <div className="meeting-review-meta">
        {showPerson ? (
          <span className="meeting-review-meta-item">
            <span>Person</span>
            <strong>{item.person.displayName}</strong>
          </span>
        ) : null}
        <span className="meeting-review-meta-item">
          <span>Meeting</span>
          <strong>{item.meetingTitle}</strong>
        </span>
        {rawStatus ? (
          <span className="meeting-review-meta-item">
            <span>Status</span>
            <strong>{rawStatus}</strong>
          </span>
        ) : null}
        {item.confidence ? (
          <span className="meeting-review-meta-item">
            <span>Confidence</span>
            <strong>{item.score == null ? item.confidence : `${item.confidence} / ${item.score}`}</strong>
          </span>
        ) : item.score != null ? (
          <span className="meeting-review-meta-item">
            <span>Score</span>
            <strong>{item.score}</strong>
          </span>
        ) : null}
        {item.evidenceTimestamp ? (
          <span className="meeting-review-meta-item">
            <span>Evidence</span>
            <strong>{item.evidenceTimestamp}</strong>
          </span>
        ) : null}
        {item.dueDate || item.dueText ? (
          <span className="meeting-review-meta-item">
            <span>Due</span>
            <strong>{item.dueDate || item.dueText}</strong>
          </span>
        ) : null}
        {item.taskId ? (
          <span className="meeting-review-meta-item">
            <span>Task</span>
            <strong>{item.taskId}</strong>
          </span>
        ) : null}
        {item.detailsRef ? (
          <span className="meeting-review-meta-item">
            <span>Details</span>
            <strong>{item.detailsRef}</strong>
          </span>
        ) : null}
      </div>
      {canUseWorkflow ? (
        <div className="my-accountability-card-workflow">
          <label className="task-field">
            <span className="ops-label">Action status</span>
            <select
              className="mynt-identity-select"
              value={normalizeMyAccountabilityActionStatus(item.status)}
              disabled={pending || !item.assertionId}
              onChange={(event) => onActionStatusChange?.(item, event.target.value as MyAccountabilityActionStatus)}
            >
              {ACTION_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="mynt-item-actions">
        <AppLink href={`/meetings/${encodeURIComponent(item.meetingId)}/items/${encodeURIComponent(item.id)}`}>
          Open in My meetings
        </AppLink>
        {canReview ? (
          <>
            <button type="button" className="meeting-review-action-button" disabled={pending || !item.assertionId} onClick={() => onReview("accept", item)}>
              Approve
            </button>
            <button type="button" className="meeting-review-action-button meeting-review-action-danger" disabled={pending || !item.assertionId} onClick={() => onReview("reject", item)}>
              Reject
            </button>
          </>
        ) : null}
        {canMarkDone ? (
          <button type="button" className="meeting-review-action-button" disabled={pending || !item.assertionId} onClick={() => onMarkDone(item)}>
            Mark as done
          </button>
        ) : null}
        {canReassign ? (
          <ActionReassignControl
            assertionId={item.assertionId}
            currentAssignee={item.person.raw}
            meetingParticipants={item.meetingParticipants}
            identities={assigneeIdentities}
            pending={pending}
            onReassign={onReassign}
            onOpenChange={setReassignOpen}
          />
        ) : null}
      </div>
    </article>
  );
}
