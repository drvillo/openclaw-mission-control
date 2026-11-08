"use client";

import { useCallback, useState } from "react";
import {
  personForAssignee,
  postMeetingReview,
  type MeetingReviewPayloadItem,
  type MeetingReviewSuccess,
  type ReassignActionPayload,
} from "../lib/meeting-review-client";
import type { MyAccountabilityActionStatus } from "../lib/my-accountability";
import type { MyntIndex, MyntItem } from "../lib/mynt";

export type AssertionReviewOperation = "accept" | "reject";

export type AssertionActionItem = {
  id?: string | null;
  kind: "action" | "decision";
  assertionId: string | null;
  reviewStatus: "needs_review" | "accepted";
  status?: string | null;
};

export type AssertionActionState = {
  pending: boolean;
  error: string | null;
};

type ReviewItemsOptions<T extends AssertionActionItem> = {
  pendingOnly?: boolean;
  emptyMessage?: string;
  onSuccess?: (payload: MeetingReviewSuccess, payloadItems: MeetingReviewPayloadItem[], items: T[]) => void;
  onMessage?: (message: string) => void;
};

type ReassignOptions = {
  onSuccess?: (payload: ReassignActionPayload, summary: string) => void;
  onMessage?: (message: string) => void;
};

type MarkDoneOptions<T extends AssertionActionItem> = {
  onSuccess?: (payload: MeetingReviewSuccess, item: T) => void;
  onMessage?: (message: string) => void;
};

type StatusOptions<T extends AssertionActionItem> = {
  onOptimistic?: () => void;
  onRollback?: () => void;
  onSuccess?: (payload: MeetingReviewSuccess, item: T) => void;
  onMessage?: (message: string) => void;
};

function keyFromPayload(item: MeetingReviewPayloadItem) {
  return `${item.kind}:${item.assertionId}`;
}

export function assertionActionKey(item: AssertionActionItem) {
  return `${item.kind}:${item.assertionId ?? item.id ?? "missing"}`;
}

export function assertionPayloadItems<T extends AssertionActionItem>(items: T[], options: { pendingOnly?: boolean } = {}) {
  return items
    .filter((item): item is T & { assertionId: string } => Boolean(item.assertionId) && (!options.pendingOnly || item.reviewStatus === "needs_review"))
    .map((item) => ({ kind: item.kind, assertionId: item.assertionId }));
}

export function applyReviewToItems<T extends AssertionActionItem>(items: T[], operation: AssertionReviewOperation, payloadItems: MeetingReviewPayloadItem[]) {
  const keys = new Set(payloadItems.map(keyFromPayload));
  return operation === "accept"
    ? items.map((item) => (item.assertionId && keys.has(assertionActionKey(item)) ? { ...item, reviewStatus: "accepted" as const } : item))
    : items.filter((item) => !item.assertionId || !keys.has(assertionActionKey(item)));
}

export function applyActionDoneToItems<T extends AssertionActionItem>(items: T[], assertionIds: string[]) {
  const ids = new Set(assertionIds);
  return items.map((item) =>
    item.kind === "action" && item.assertionId && ids.has(item.assertionId)
      ? { ...item, reviewStatus: "accepted" as const, status: "done" }
      : item,
  );
}

export function applyActionStatusToItems<T extends AssertionActionItem>(items: T[], assertionId: string, status: MyAccountabilityActionStatus) {
  return items.map((item) => (item.kind === "action" && item.assertionId === assertionId ? { ...item, status } : item));
}

export function applyMyntReassignment(items: MyntItem[], assertionId: string, assignee: string, identities: MyntIndex["identities"]) {
  return items.map((item) =>
    item.kind === "action" && item.assertionId === assertionId ? { ...item, person: personForAssignee(assignee, identities) } : item,
  );
}

export function useAssertionActions() {
  const [states, setStates] = useState<Record<string, AssertionActionState>>({});

  const setKeysPending = useCallback((keys: string[]) => {
    setStates((current) => {
      const next = { ...current };
      for (const key of keys) {
        next[key] = { pending: true, error: null };
      }
      return next;
    });
  }, []);

  const setKeysComplete = useCallback((keys: string[], error: string | null) => {
    setStates((current) => {
      const next = { ...current };
      for (const key of keys) {
        next[key] = { pending: false, error };
      }
      return next;
    });
  }, []);

  const getActionState = useCallback(
    (item: AssertionActionItem | { kind: "action" | "decision"; assertionId: string | null }) =>
      states[assertionActionKey(item as AssertionActionItem)] ?? { pending: false, error: null },
    [states],
  );

  const reviewItems = useCallback(
    async <T extends AssertionActionItem>(operation: AssertionReviewOperation, items: T[], options: ReviewItemsOptions<T> = {}) => {
      const payloadItems = assertionPayloadItems(items, { pendingOnly: options.pendingOnly });
      if (payloadItems.length === 0) {
        options.onMessage?.(options.emptyMessage ?? "No pending review items with assertion IDs.");
        return false;
      }
      const keys = payloadItems.map(keyFromPayload);
      setKeysPending(keys);
      try {
        const payload = await postMeetingReview({ operation, items: payloadItems });
        options.onSuccess?.(payload, payloadItems, items);
        options.onMessage?.(payload.summary);
        setKeysComplete(keys, null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.onMessage?.(message);
        setKeysComplete(keys, message);
        return false;
      }
    },
    [setKeysComplete, setKeysPending],
  );

  const reviewItem = useCallback(
    <T extends AssertionActionItem>(operation: AssertionReviewOperation, item: T, options: Omit<ReviewItemsOptions<T>, "pendingOnly"> = {}) =>
      reviewItems(operation, [item], { ...options, pendingOnly: true }),
    [reviewItems],
  );

  const reassignAction = useCallback(
    async (assertionId: string, assignee: string, options: ReassignOptions = {}) => {
      const key = keyFromPayload({ kind: "action", assertionId });
      setKeysPending([key]);
      try {
        const payload = await postMeetingReview({ operation: "reassign_action", assertionId, assignee });
        const reassignPayload = payload.payload as ReassignActionPayload | undefined;
        if (reassignPayload?.reassigned !== 1 || !reassignPayload.assignee) {
          const message = payload.summary || "No action was reassigned.";
          options.onMessage?.(message);
          setKeysComplete([key], message);
          return false;
        }
        options.onSuccess?.(reassignPayload, payload.summary);
        options.onMessage?.(payload.summary);
        setKeysComplete([key], null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.onMessage?.(message);
        setKeysComplete([key], message);
        return false;
      }
    },
    [setKeysComplete, setKeysPending],
  );

  const markActionDone = useCallback(
    async <T extends AssertionActionItem>(item: T, options: MarkDoneOptions<T> = {}) => {
      if (!item.assertionId) {
        options.onMessage?.("This action does not have a database assertion ID.");
        return false;
      }
      const key = assertionActionKey(item);
      setKeysPending([key]);
      try {
        const payload = await postMeetingReview({ operation: "mark_action_done", assertionId: item.assertionId });
        options.onSuccess?.(payload, item);
        options.onMessage?.(payload.summary);
        setKeysComplete([key], null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.onMessage?.(message);
        setKeysComplete([key], message);
        return false;
      }
    },
    [setKeysComplete, setKeysPending],
  );

  const updateActionStatus = useCallback(
    async <T extends AssertionActionItem>(item: T, status: MyAccountabilityActionStatus, options: StatusOptions<T> = {}) => {
      if (!item.assertionId) {
        return false;
      }
      const key = assertionActionKey(item);
      options.onOptimistic?.();
      setKeysPending([key]);
      try {
        const payload = await postMeetingReview({ operation: "update_action_status", assertionId: item.assertionId, status });
        options.onSuccess?.(payload, item);
        options.onMessage?.(payload.summary);
        setKeysComplete([key], null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.onRollback?.();
        options.onMessage?.(message);
        setKeysComplete([key], message);
        return false;
      }
    },
    [setKeysComplete, setKeysPending],
  );

  return { getActionState, reviewItem, reviewItems, reassignAction, markActionDone, updateActionStatus };
}
