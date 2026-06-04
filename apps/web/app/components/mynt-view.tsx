"use client";

import { Fragment, useMemo, useState } from "react";
import { AssertionCard, type AssertionReviewOperation } from "./assertion-card";
import { formatDisplayDate } from "../lib/date-format";
import {
  meetingReviewPayloadItems,
  personForAssignee,
  postMeetingReview,
  type MeetingReviewPayloadItem,
  type ReassignActionPayload,
} from "../lib/meeting-review-client";
import type { MyntIndex, MyntItem, MyntPerson } from "../lib/mynt";

type MyntViewProps = {
  index: MyntIndex;
  expandedPersonId?: string;
  pendingReviewOnly?: boolean;
};

type ActionResponse = { ok: true; summary: string; payload?: unknown } | { ok: false; error: string };
type ReviewOperation = AssertionReviewOperation;

function pendingItems(items: MyntItem[]) {
  return items.filter((item) => item.reviewStatus === "needs_review");
}

function hasAcceptablePendingItems(items: MyntItem[]) {
  return meetingReviewPayloadItems(pendingItems(items)).length > 0;
}

function filterPersonToPending(person: MyntPerson): MyntPerson | null {
  const actions = pendingItems(person.actions);
  const decisions = pendingItems(person.decisions);
  const totalCount = actions.length + decisions.length;
  if (totalCount === 0) {
    return null;
  }
  return {
    ...person,
    actionCount: actions.length,
    decisionCount: decisions.length,
    totalCount,
    actions,
    decisions,
  };
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

function AccountabilityLane({
  title,
  description,
  items,
  pending,
  onReview,
  onReassign,
  assigneeIdentities,
}: {
  title: string;
  description: string;
  items: MyntItem[];
  pending: boolean;
  onReview: (operation: ReviewOperation, item: MyntItem) => void;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  assigneeIdentities: MyntIndex["identities"];
}) {
  return (
    <section className="mynt-lane">
      <header className="mynt-lane-header">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span className="mynt-lane-count">{items.length}</span>
      </header>
      <div className="mynt-lane-list">
        {items.map((item) => (
          <AssertionCard
            key={item.id}
            item={item}
            pending={pending}
            onReview={onReview}
            onReassign={item.kind === "action" ? onReassign : undefined}
            assigneeIdentities={assigneeIdentities}
          />
        ))}
        {items.length === 0 ? <div className="mynt-lane-empty">No {title.toLowerCase()} for this person.</div> : null}
      </div>
    </section>
  );
}

export function MyntView({ index, expandedPersonId: initialExpandedPersonId, pendingReviewOnly = false }: MyntViewProps) {
  const [localItems, setLocalItems] = useState(index.items);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(initialExpandedPersonId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const peopleWithSelf = useMemo(() => buildPeople(localItems.filter((item) => !item.archived)), [localItems]);
  const visiblePeople = useMemo(() => {
    const people = peopleWithSelf.filter((person) => !person.isSelf);
    return pendingReviewOnly
      ? people.map(filterPersonToPending).filter((person): person is MyntPerson => Boolean(person))
      : people;
  }, [peopleWithSelf, pendingReviewOnly]);

  async function postJson(endpoint: string, body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ActionResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
      }
      setMessage(payload.summary);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function postReview(operation: ReviewOperation, items: MeetingReviewPayloadItem[]) {
    if (items.length === 0) {
      setMessage("No pending review items with assertion IDs.");
      return;
    }
    setPending(true);
    setMessage(null);
    void postMeetingReview({ operation, items })
      .then((payload) => {
        setMessage(payload.summary);
        window.location.reload();
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(false));
  }

  function reviewItem(operation: ReviewOperation, item: MyntItem) {
    if (!item.assertionId) {
      setMessage("This item does not have a database assertion ID.");
      return;
    }
    if (operation === "reject" && !window.confirm(`Reject and delete ${item.kind === "action" ? "action" : "decision"} from ${item.meetingTitle}?`)) {
      return;
    }
    postReview(operation, [{ kind: item.kind, assertionId: item.assertionId }]);
  }

  async function reassignAction(assertionId: string, assignee: string) {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postMeetingReview({ operation: "reassign_action", assertionId, assignee });
      const reassignPayload = payload.payload as ReassignActionPayload | undefined;
      if (reassignPayload?.reassigned !== 1 || !reassignPayload.assignee) {
        setMessage(payload.summary || "No action was reassigned.");
        return false;
      }
      setLocalItems((current) =>
        current.map((item) =>
          item.kind === "action" && item.assertionId === assertionId
            ? { ...item, person: personForAssignee(reassignPayload.assignee ?? assignee, index.identities) }
            : item,
        ),
      );
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

  return (
    <div className="mynt-shell">
      <div className="mynt-toolbar">
        <button type="button" className="action-trigger" onClick={archiveOlderThan30} disabled={pending}>
          Archive older than 30 days
        </button>
        <span className="muted">
          Preview: {index.archivePreview.itemCount} hidden items, {index.archivePreview.linkedTaskCount} linked tasks, cutoff{" "}
          {formatDisplayDate(index.archivePreview.cutoffDate)}
        </span>
        {pendingReviewOnly ? <span className="muted">Pending review only</span> : null}
      </div>
      {message ? <p className="action-message mynt-message">{message}</p> : null}

      <div className="table-shell mynt-people-list">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Total</th>
              <th>Actions</th>
              <th>Decisions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePeople.map((person) => {
              const expanded = expandedPersonId === person.id;
              return (
                <Fragment key={person.id}>
                  <tr
                    className={`meeting-row ${expanded ? "meeting-row-active" : ""}`}
                    onClick={() => {
                      const next = expanded ? null : person.id;
                      setExpandedPersonId(next);
                      window.history.pushState(null, "", next ? `/accountability/people/${encodeURIComponent(next)}` : "/accountability/people");
                    }}
                    aria-expanded={expanded}
                  >
                    <td>
                      <button type="button" className="mynt-row-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${person.displayName}`}>
                        {expanded ? "-" : "+"}
                      </button>
                      <strong>{person.displayName}</strong>
                      {person.email ? <div className="muted">{person.email}</div> : null}
                    </td>
                    <td>{person.totalCount}</td>
                    <td>{person.actionCount}</td>
                    <td>{person.decisionCount}</td>
                  </tr>
                  {expanded ? (
                    <tr className="mynt-expanded-row">
                      <td colSpan={4}>
                        <div className="mynt-expanded-actions">
                          <button
                            type="button"
                            className="action-trigger"
                            disabled={pending || !hasAcceptablePendingItems([...person.actions, ...person.decisions])}
                            onClick={() => postReview("accept", meetingReviewPayloadItems(pendingItems([...person.actions, ...person.decisions])))}
                          >
                            Accept pending
                          </button>
                        </div>
                        <div className="mynt-lanes" aria-label={`${person.displayName} accountability items`}>
                          <AccountabilityLane
                            title="Actions"
                            description="Assigned follow-ups extracted from meeting notes."
                            items={person.actions}
                            pending={pending}
                            onReview={reviewItem}
                            onReassign={reassignAction}
                            assigneeIdentities={index.identities}
                          />
                          <AccountabilityLane
                            title="Decisions"
                            description="Owned decisions extracted from meeting notes."
                            items={person.decisions}
                            pending={pending}
                            onReview={reviewItem}
                            onReassign={reassignAction}
                            assigneeIdentities={index.identities}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {visiblePeople.length === 0 ? (
              <tr>
                <td colSpan={4}>No accountable people in the current view.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
