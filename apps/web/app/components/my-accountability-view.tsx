"use client";

import { useMemo, useState } from "react";
import { AssertionCard, type AssertionReviewOperation } from "./assertion-card";
import { AssertionListLane } from "./assertion-list-lane";
import { KanbanBoard } from "./kanban-board";
import { SearchControl } from "./search-control";
import {
  applyActionDoneToItems,
  applyActionStatusToItems,
  applyMyntReassignment,
  applyReviewToItems,
  useAssertionActions,
} from "./use-assertion-actions";
import { useUrlSearchQuery } from "./use-url-search-query";
import {
  MY_ACCOUNTABILITY_ACTION_COLUMNS,
  groupAcceptedSelfAssignedActions,
  normalizeMyAccountabilityActionStatus,
  partitionSelfAssignedDecisions,
  pendingSelfAssignedActions,
  type MyAccountabilityActionStatus,
} from "../lib/my-accountability";
import type { MyntIndex, MyntItem } from "../lib/mynt";
import { itemMatchesSearch } from "../lib/search";

type MyAccountabilityViewProps = {
  index: MyntIndex;
};

type MyAccountabilityTab = "actions" | "decisions";

export function MyAccountabilityView({ index }: MyAccountabilityViewProps) {
  const [items, setItems] = useState(index.items);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MyAccountabilityTab>("actions");
  const [search, setSearch] = useUrlSearchQuery();
  const assertionActions = useAssertionActions();

  const visibleItems = useMemo(() => items.filter((item) => itemMatchesSearch(item, search)), [items, search]);
  const localIndex = useMemo(() => ({ ...index, items: visibleItems }), [index, visibleItems]);
  const reviewActions = useMemo(() => pendingSelfAssignedActions(localIndex), [localIndex]);
  const actionColumns = useMemo(() => groupAcceptedSelfAssignedActions(localIndex), [localIndex]);
  const acceptedActions = useMemo(() => actionColumns.flatMap((column) => column.items), [actionColumns]);
  const decisions = useMemo(() => partitionSelfAssignedDecisions(localIndex), [localIndex]);
  const selfIdentity = index.identities.find((identity) => identity.isSelf);

  function reviewItem(operation: AssertionReviewOperation, item: MyntItem) {
    if (!item.assertionId) {
      setMessage("This item does not have a database assertion ID.");
      return;
    }
    setMessage(null);
    void assertionActions.reviewItem(operation, item, {
      onSuccess: (_payload, payloadItems) => setItems((current) => applyReviewToItems(current, operation, payloadItems)),
    });
  }

  function markActionDone(item: MyntItem) {
    if (!item.assertionId) {
      setMessage("This action does not have a database assertion ID.");
      return;
    }
    setMessage(null);
    void assertionActions.markActionDone(item, {
      onSuccess: () => setItems((current) => applyActionDoneToItems(current, [item.assertionId as string])),
    });
  }

  function updateActionStatus(item: MyntItem, status: MyAccountabilityActionStatus) {
    if (!item.assertionId || normalizeMyAccountabilityActionStatus(item.status) === status) {
      return;
    }
    const previousItems = items;
    setMessage(null);
    void assertionActions.updateActionStatus(item, status, {
      onOptimistic: () => setItems((current) => applyActionStatusToItems(current, item.assertionId as string, status)),
      onRollback: () => setItems(previousItems),
    });
  }

  async function reassignAction(assertionId: string, assignee: string) {
    setMessage(null);
    return assertionActions.reassignAction(assertionId, assignee, {
      onSuccess: (payload) => setItems((current) => applyMyntReassignment(current, assertionId, payload.assignee ?? assignee, index.identities)),
    });
  }

  return (
    <div className="my-accountability-shell">
      <div className="mynt-toolbar">
        <SearchControl
          value={search}
          onChange={setSearch}
          placeholder="Search my actions and decisions"
          resultSummary={`${reviewActions.length + acceptedActions.length + decisions.pending.length + decisions.accepted.length} visible`}
        />
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
              pending={false}
              assigneeIdentities={index.identities}
              emptyText="No self-assigned actions need review."
              className="my-accountability-review-lane"
              onReview={reviewItem}
              onReassign={reassignAction}
              onMarkDone={markActionDone}
              getActionState={assertionActions.getActionState}
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
              canDragItem={(item) => !assertionActions.getActionState(item).pending && Boolean(item.assertionId)}
              onMove={(assertionId, status) => {
                const item = items.find((entry) => entry.kind === "action" && entry.assertionId === assertionId);
                if (item) {
                  updateActionStatus(item, status);
                }
              }}
              renderCard={(item) => (
                <AssertionCard
                  item={item}
                  pending={false}
                  actionState={assertionActions.getActionState(item)}
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
              pending={false}
              assigneeIdentities={index.identities}
              emptyText="No self-assigned decisions need review."
              className="my-accountability-review-lane"
              onReview={reviewItem}
              getActionState={assertionActions.getActionState}
            />
          </section>

          <section className="my-accountability-section">
            <AssertionListLane
              title="Decision log"
              description="Accepted self-assigned decisions in chronological order."
              items={decisions.accepted}
              pending={false}
              assigneeIdentities={index.identities}
              emptyText="No accepted decisions yet."
              className="my-accountability-review-lane"
              getActionState={assertionActions.getActionState}
            />
          </section>
        </div>
      )}
    </div>
  );
}
