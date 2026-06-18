"use client";

import { type ReactNode } from "react";
import { AssertionCard, type AssertionReviewOperation } from "./assertion-card";
import type { MyAccountabilityActionStatus } from "../lib/my-accountability";
import type { MyntIndex, MyntItem } from "../lib/mynt";

type AssertionLaneShellProps = {
  title: string;
  description: string;
  count: number;
  emptyText: string;
  className?: string;
  children: ReactNode;
};

type AssertionListLaneProps = {
  title: string;
  description: string;
  items: MyntItem[];
  pending: boolean;
  assigneeIdentities: MyntIndex["identities"];
  emptyText: string;
  className?: string;
  showPerson?: boolean;
  showActionWorkflow?: boolean;
  onReview?: (operation: AssertionReviewOperation, item: MyntItem) => void;
  onReassign?: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onActionStatusChange?: (item: MyntItem, status: MyAccountabilityActionStatus) => void;
  onMarkDone?: (item: MyntItem) => void;
};

export function AssertionLaneShell({ title, description, count, emptyText, className, children }: AssertionLaneShellProps) {
  return (
    <section className={`mynt-lane${className ? ` ${className}` : ""}`}>
      <header className="mynt-lane-header">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span className="mynt-lane-count">{count}</span>
      </header>
      <div className="mynt-lane-list">
        {count === 0 ? <div className="mynt-lane-empty">{emptyText}</div> : children}
      </div>
    </section>
  );
}

export function AssertionListLane({
  title,
  description,
  items,
  pending,
  assigneeIdentities,
  emptyText,
  className,
  showPerson = false,
  showActionWorkflow = false,
  onReview,
  onReassign,
  onActionStatusChange,
  onMarkDone,
}: AssertionListLaneProps) {
  return (
    <AssertionLaneShell title={title} description={description} count={items.length} emptyText={emptyText} className={className}>
      {items.map((item) => (
        <AssertionCard
          key={item.id}
          item={item}
          pending={pending}
          assigneeIdentities={assigneeIdentities}
          showPerson={showPerson}
          showActionWorkflow={item.kind === "action" && showActionWorkflow}
          onReview={onReview}
          onReassign={item.kind === "action" ? onReassign : undefined}
          onActionStatusChange={item.kind === "action" ? onActionStatusChange : undefined}
          onMarkDone={item.kind === "action" ? onMarkDone : undefined}
        />
      ))}
    </AssertionLaneShell>
  );
}
