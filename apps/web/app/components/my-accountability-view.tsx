"use client";

import { startTransition, useMemo, useState } from "react";
import { AssertionCard, type AssertionReviewOperation } from "./assertion-card";
import { AssertionListLane } from "./assertion-list-lane";
import { KanbanBoard } from "./kanban-board";
import {
  MY_ACCOUNTABILITY_ACTION_COLUMNS,
  groupAcceptedSelfAssignedActions,
  normalizeMyAccountabilityActionStatus,
  partitionSelfAssignedDecisions,
  pendingSelfAssignedActions,
  type MyAccountabilityActionStatus,
} from "../lib/my-accountability";
import { personForAssignee, postMeetingReview, type ReassignActionPayload } from "../lib/meeting-review-client";
import type { MyntIndex, MyntItem } from "../lib/mynt";

type MyAccountabilityViewProps = {
  index: MyntIndex;
};

type MyAccountabilityTab = "actions" | "decisions";

export function MyAccountabilityView({ index }: MyAccountabilityViewProps) {
  const [items, setItems] = useState(index.items);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activeTab, setActiveTab] = useState<MyAccountabilityTab>("actions");

  const localIndex = useMemo(() => ({ ...index, items }), [index, items]);
  const reviewActions = useMemo(() => pendingSelfAssignedActions(localIndex), [localIndex]);
  const actionColumns = useMemo(() => groupAcceptedSelfAssignedActions(localIndex), [localIndex]);
  const acceptedActions = useMemo(() => actionColumns.flatMap((column) => column.items), [actionColumns]);
  const decisions = useMemo(() => partitionSelfAssignedDecisions(localIndex), [localIndex]);
  const selfIdentity = index.identities.find((identity) => identity.isSelf);

  async function postJson(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const payload = await postMeetingReview(body);
      setMessage(payload.summary);
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setPending(false);
    }
  }

  function reviewItem(operation: AssertionReviewOperation, item: MyntItem) {
    if (!item.assertionId) {
      setMessage("This item does not have a database assertion ID.");
      return;
    }
    if (operation === "reject" && !window.confirm(`Reject and delete ${item.kind === "action" ? "action" : "decision"} from ${item.meetingTitle}?`)) {
      return;
    }
    startTransition(async () => {
      const payload = await postJson({ operation, items: [{ kind: item.kind, assertionId: item.assertionId }] });
      if (!payload) {
        return;
      }
      setItems((current) =>
        operation === "accept"
          ? current.map((entry) => (entry.assertionId === item.assertionId && entry.kind === item.kind ? { ...entry, reviewStatus: "accepted" } : entry))
          : current.filter((entry) => !(entry.assertionId === item.assertionId && entry.kind === item.kind)),
      );
    });
  }

  function markActionDone(item: MyntItem) {
    if (!item.assertionId) {
      setMessage("This action does not have a database assertion ID.");
      return;
    }
    startTransition(async () => {
      const payload = await postJson({ operation: "mark_action_done", assertionId: item.assertionId });
      if (!payload) {
        return;
      }
      setItems((current) =>
        current.map((entry) =>
          entry.kind === "action" && entry.assertionId === item.assertionId
            ? { ...entry, reviewStatus: "accepted", status: "done" }
            : entry,
        ),
      );
    });
  }

  function updateActionStatus(item: MyntItem, status: MyAccountabilityActionStatus) {
    if (!item.assertionId || normalizeMyAccountabilityActionStatus(item.status) === status) {
      return;
    }
    const previousItems = items;
    setItems((current) => current.map((entry) => (entry.kind === "action" && entry.assertionId === item.assertionId ? { ...entry, status } : entry)));
    startTransition(async () => {
      const payload = await postJson({ operation: "update_action_status", assertionId: item.assertionId, status });
      if (!payload) {
        setItems(previousItems);
      }
    });
  }

  async function reassignAction(assertionId: string, assignee: string) {
    const payload = await postJson({ operation: "reassign_action", assertionId, assignee });
    const reassignPayload = payload?.payload as ReassignActionPayload | undefined;
    if (reassignPayload?.reassigned !== 1 || !reassignPayload.assignee) {
      return false;
    }
    setItems((current) =>
      current.map((item) =>
        item.kind === "action" && item.assertionId === assertionId
          ? { ...item, person: personForAssignee(reassignPayload.assignee ?? assignee, index.identities) }
          : item,
      ),
    );
    return true;
  }

  return (
    <div className="my-accountability-shell">
      <div className="mynt-toolbar">
        <span className="muted">
          Self identity: {selfIdentity?.displayName ?? "Francesco Vivoli"}{selfIdentity?.email ? ` (${selfIdentity.email})` : ""}
        </span>
        {message ? <span className="action-message mynt-message">{message}</span> : null}
      </div>

      <div className="my-accountability-tabs" role="tablist" aria-label="My Accountability sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "actions"}
          className={`my-accountability-tab ${activeTab === "actions" ? "my-accountability-tab-active" : ""}`}
          onClick={() => setActiveTab("actions")}
        >
          Actions
          <span>{reviewActions.length + actionColumns.reduce((sum, column) => sum + column.items.length, 0)}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "decisions"}
          className={`my-accountability-tab ${activeTab === "decisions" ? "my-accountability-tab-active" : ""}`}
          onClick={() => setActiveTab("decisions")}
        >
          Decisions
          <span>{decisions.pending.length + decisions.accepted.length}</span>
        </button>
      </div>

      {activeTab === "actions" ? (
        <div className="my-accountability-tab-panel" role="tabpanel">
          <section className="my-accountability-section">
            <AssertionListLane
              title="Review inbox"
              description="Self-assigned action assertions waiting for review."
              items={reviewActions}
              pending={pending}
              assigneeIdentities={index.identities}
              emptyText="No self-assigned actions need review."
              className="my-accountability-review-lane"
              onReview={reviewItem}
              onReassign={reassignAction}
              onMarkDone={markActionDone}
            />
          </section>

          <section className="my-accountability-section">
            <header className="my-accountability-section-header">
              <div>
                <h3>Actions</h3>
                <p className="muted">Accepted self-assigned canonical actions grouped by personal workflow status.</p>
              </div>
            </header>
            <KanbanBoard
              columns={MY_ACCOUNTABILITY_ACTION_COLUMNS}
              items={acceptedActions}
              getItemId={(item) => item.assertionId ?? item.id}
              getItemStatus={(item) => normalizeMyAccountabilityActionStatus(item.status)}
              boardClassName="tasks-board my-accountability-board"
              countLabel={(count) => `${count} action${count === 1 ? "" : "s"}`}
              emptyText={(column) => `No actions in ${column.label.toLowerCase()}.`}
              canDragItem={(item) => !pending && Boolean(item.assertionId)}
              onMove={(assertionId, status) => {
                const item = items.find((entry) => entry.kind === "action" && entry.assertionId === assertionId);
                if (item) {
                  updateActionStatus(item, status);
                }
              }}
              renderCard={(item) => (
                <AssertionCard
                  item={item}
                  pending={pending}
                  assigneeIdentities={index.identities}
                  showActionWorkflow
                  onActionStatusChange={updateActionStatus}
                  onReassign={reassignAction}
                  onMarkDone={markActionDone}
                />
              )}
            />
          </section>
        </div>
      ) : (
        <div className="my-accountability-tab-panel my-accountability-decisions" role="tabpanel">
          <section className="my-accountability-section">
            <AssertionListLane
              title="Review inbox"
              description="Self-assigned decision assertions waiting for review."
              items={decisions.pending}
              pending={pending}
              assigneeIdentities={index.identities}
              emptyText="No self-assigned decisions need review."
              className="my-accountability-review-lane"
              onReview={reviewItem}
            />
          </section>

          <section className="my-accountability-section">
            <AssertionListLane
              title="Decision log"
              description="Accepted self-assigned decisions in chronological order."
              items={decisions.accepted}
              pending={pending}
              assigneeIdentities={index.identities}
              emptyText="No accepted decisions yet."
              className="my-accountability-review-lane"
            />
          </section>
        </div>
      )}
    </div>
  );
}
