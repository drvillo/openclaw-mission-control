"use client";

import { Fragment, useMemo, useState } from "react";
import { AppLink } from "./app-link";
import { formatDisplayDate } from "../lib/date-format";
import type { MyntIndex, MyntItem } from "../lib/mynt";

type MyntViewProps = {
  index: MyntIndex;
  expandedPersonId?: string;
};

type ActionResponse = { ok: true; summary: string; payload?: unknown } | { ok: false; error: string };

function itemDate(item: MyntItem) {
  return formatDisplayDate(item.meetingDate);
}

function AccountabilityLane({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: MyntItem[];
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
          <article key={item.id} className="mynt-item-card">
            <div className="mynt-item-card-header">
              <span className={`mynt-item-kind mynt-item-kind-${item.kind}`}>
                {item.kind === "action" ? "Action" : "Decision"}
              </span>
              <time dateTime={item.meetingDate}>{itemDate(item)}</time>
            </div>
            <p>{item.summary}</p>
            <div className="meeting-review-meta">
              <span className="meeting-review-meta-item">
                <span>Meeting</span>
                <strong>{item.meetingTitle}</strong>
              </span>
              {item.status ? (
                <span className="meeting-review-meta-item">
                  <span>Status</span>
                  <strong>{item.status}</strong>
                </span>
              ) : null}
              {item.confidence ? (
                <span className="meeting-review-meta-item">
                  <span>Confidence</span>
                  <strong>{item.confidence}</strong>
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
            </div>
            <div className="mynt-item-actions">
              <AppLink href={`/meetings/${encodeURIComponent(item.meetingId)}/items/${encodeURIComponent(item.id)}`}>
                Open in My meetings
              </AppLink>
            </div>
          </article>
        ))}
        {items.length === 0 ? <div className="mynt-lane-empty">No {title.toLowerCase()} for this person.</div> : null}
      </div>
    </section>
  );
}

export function MyntView({ index, expandedPersonId: initialExpandedPersonId }: MyntViewProps) {
  const [showSelf, setShowSelf] = useState(index.state.showSelfDefault);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(initialExpandedPersonId ?? index.people[0]?.id ?? index.peopleWithSelf[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visiblePeople = useMemo(
    () => (showSelf ? index.peopleWithSelf : index.peopleWithSelf.filter((person) => !person.isSelf)),
    [index.peopleWithSelf, showSelf],
  );

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
        <label className="routing-toggle">
          <input type="checkbox" checked={showSelf} onChange={(event) => setShowSelf(event.target.checked)} />
          Show self
        </label>
        <button type="button" className="action-trigger" onClick={archiveOlderThan30} disabled={pending}>
          Archive older than 30 days
        </button>
        <span className="muted">
          Preview: {index.archivePreview.itemCount} hidden items, {index.archivePreview.linkedTaskCount} linked tasks, cutoff{" "}
          {formatDisplayDate(index.archivePreview.cutoffDate)}
        </span>
        <a className="action-trigger" href="/accountability/identity-admin">
          Identity admin
        </a>
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
                      window.history.pushState(null, "", next ? `/accountability/people/${encodeURIComponent(next)}` : "/accountability");
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
                        <div className="mynt-lanes" aria-label={`${person.displayName} accountability items`}>
                          <AccountabilityLane
                            title="Actions"
                            description="Assigned follow-ups extracted from meeting notes."
                            items={person.actions}
                          />
                          <AccountabilityLane
                            title="Decisions"
                            description="Owned decisions extracted from meeting notes."
                            items={person.decisions}
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
