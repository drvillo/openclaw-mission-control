"use client";

import { normalizeMyAccountabilityActionStatus } from "../lib/my-accountability";
import type { AssertionActionItem, AssertionActionState, AssertionReviewOperation } from "./use-assertion-actions";

type AssertionActionControlsProps<T extends AssertionActionItem> = {
  item: T;
  actionState: AssertionActionState;
  reassignOpen?: boolean;
  showReview?: boolean;
  showMarkDone?: boolean;
  acceptLabel?: string;
  onReview?: (operation: AssertionReviewOperation, item: T) => void;
  onMarkDone?: (item: T) => void;
};

export function AssertionActionControls<T extends AssertionActionItem>({
  item,
  actionState,
  reassignOpen = false,
  showReview = true,
  showMarkDone = true,
  acceptLabel = "Approve",
  onReview,
  onMarkDone,
}: AssertionActionControlsProps<T>) {
  const hasAssertionId = Boolean(item.assertionId);
  const canReview = showReview && item.reviewStatus === "needs_review" && !reassignOpen && onReview;
  const canMarkDone =
    showMarkDone && item.kind === "action" && onMarkDone && normalizeMyAccountabilityActionStatus(item.status ?? null) !== "done";

  return (
    <>
      {canReview ? (
        <>
          <button
            type="button"
            className="meeting-review-action-button"
            disabled={actionState.pending || !hasAssertionId}
            onClick={() => onReview("accept", item)}
          >
            {acceptLabel}
          </button>
          <button
            type="button"
            className="meeting-review-action-button meeting-review-action-danger"
            disabled={actionState.pending || !hasAssertionId}
            onClick={() => onReview("reject", item)}
          >
            Reject
          </button>
        </>
      ) : null}
      {canMarkDone ? (
        <button
          type="button"
          className="meeting-review-action-button"
          disabled={actionState.pending || !hasAssertionId}
          onClick={() => onMarkDone(item)}
        >
          Mark as done
        </button>
      ) : null}
      {actionState.error ? <span className="meeting-review-action-error">{actionState.error}</span> : null}
    </>
  );
}
