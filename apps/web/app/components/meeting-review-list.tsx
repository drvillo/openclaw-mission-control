"use client";

import type { ReactNode } from "react";

type MeetingReviewItemShellProps = {
  children: ReactNode;
  className?: string;
  focused?: boolean;
};

type MeetingReviewListSectionProps = {
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
};

export function MeetingReviewMetaItem({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") {
    return null;
  }
  return (
    <span className="meeting-review-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function MeetingReviewItemShell({ children, className, focused = false }: MeetingReviewItemShellProps) {
  return (
    <article className={`meeting-review-item${focused ? " meeting-review-item-focused" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </article>
  );
}

export function MeetingReviewListSection({ title, count, emptyText, children }: MeetingReviewListSectionProps) {
  return (
    <section className="meeting-review-section">
      <div className="meeting-review-section-header">
        <h4>{title}</h4>
        <span className="meeting-review-section-count">{count}</span>
      </div>
      {count > 0 ? <div className="meeting-review-list">{children}</div> : <p className="meeting-review-empty">{emptyText}</p>}
    </section>
  );
}
