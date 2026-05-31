"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { formatDisplayDateTime } from "../lib/date-format";

type DashboardRoutingAttempt = {
  routingId: string;
  recordedAt: string;
  expectedTargetAgent: string | null;
  actualTargetAgent: string | null;
  mechanism: string;
  accepted: number | null;
  childSessionKey: string | null;
  childSessionId: string | null;
  runId: string | null;
  status: string;
  completionSummary: string | null;
  failureMode: string;
  recoveryMode: string;
  complianceStatus: string;
  policyDomain: string | null;
  rawJson: string;
};

type DashboardRoutingGroup = {
  requestGroupKey: string;
  requestExcerpt: string;
  sourceSessionId: string;
  latestRecordedAt: string;
  attempts: DashboardRoutingAttempt[];
};

type RoutingPanelProps = {
  groups: DashboardRoutingGroup[];
};

function formatDateTime(value: string) {
  return formatDisplayDateTime(value);
}

function formatAccepted(value: number | null) {
  if (value == null) {
    return "n/a";
  }
  return value ? "accepted" : "rejected";
}

function isSameLocalDay(value: string, reference: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

function getAttemptTone(attempt: DashboardRoutingAttempt) {
  if (
    attempt.failureMode === "wrong_tool" ||
    attempt.failureMode === "incomplete_turn" ||
    attempt.failureMode === "redundant_reconfirmation" ||
    attempt.complianceStatus === "violation" ||
    attempt.status === "error" ||
    attempt.status === "failed"
  ) {
    return "error";
  }
  if (
    attempt.failureMode === "direct_fallback" ||
    attempt.failureMode === "accepted_no_completion" ||
    attempt.complianceStatus === "fallback" ||
    attempt.status === "awaiting_completion" ||
    attempt.status === "needs_user_input"
  ) {
    return "warning";
  }
  return "success";
}

function getGroupTone(group: DashboardRoutingGroup) {
  if (group.attempts.some((attempt) => getAttemptTone(attempt) === "error")) {
    return "error";
  }
  if (group.attempts.some((attempt) => getAttemptTone(attempt) === "warning")) {
    return "warning";
  }
  return "success";
}

function isSuccessfulGroup(group: DashboardRoutingGroup) {
  return group.attempts.every(
    (attempt) =>
      attempt.failureMode === "none" &&
      attempt.complianceStatus === "compliant" &&
      attempt.status === "completed",
  );
}

function summarizeGroup(group: DashboardRoutingGroup) {
  const failures = group.attempts.filter((attempt) => attempt.failureMode !== "none").map((attempt) => attempt.failureMode);
  const recoveries = group.attempts.filter((attempt) => attempt.recoveryMode !== "none").map((attempt) => attempt.recoveryMode);
  const completion = group.attempts.at(-1)?.status ?? "unknown";

  return {
    completion,
    failureLabel: failures[0] ?? "none",
    recoveryLabel: recoveries[0] ?? "none",
    compliantCount: group.attempts.filter((attempt) => attempt.complianceStatus === "compliant").length,
  };
}

function AttemptBadge({
  tone,
  children,
}: {
  tone: "error" | "warning" | "success" | "neutral";
  children: ReactNode;
}) {
  return <span className={`routing-badge routing-badge-${tone}`}>{children}</span>;
}

export function RoutingPanel({ groups }: RoutingPanelProps) {
  const [todayOnly, setTodayOnly] = useState(true);
  const [showSuccessful, setShowSuccessful] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const today = new Date();

  const sortedGroups = [...groups].sort((left, right) => right.latestRecordedAt.localeCompare(left.latestRecordedAt));
  const todayGroups = sortedGroups.filter((group) => isSameLocalDay(group.latestRecordedAt, today));
  const filteredGroups = sortedGroups.filter((group) => {
    if (todayOnly && !isSameLocalDay(group.latestRecordedAt, today)) {
      return false;
    }
    if (!showSuccessful && isSuccessfulGroup(group)) {
      return false;
    }
    return true;
  });
  const visibleGroups = showAll ? filteredGroups : filteredGroups.slice(0, 5);
  const hiddenCount = Math.max(filteredGroups.length - visibleGroups.length, 0);

  return (
    <div className="routing-panel-shell">
      <div className="routing-toolbar">
        <label className="routing-toggle">
          <input type="checkbox" checked={todayOnly} onChange={() => setTodayOnly((value) => !value)} />
          <span>Today only</span>
        </label>
        <label className="routing-toggle">
          <input type="checkbox" checked={showSuccessful} onChange={() => setShowSuccessful((value) => !value)} />
          <span>Include successful</span>
        </label>
        <label className="routing-toggle">
          <input type="checkbox" checked={showAll} onChange={() => setShowAll((value) => !value)} />
          <span>Show all</span>
        </label>
      </div>

      <div className="routing-toolbar-meta">
        <span>
          Showing {visibleGroups.length} of {filteredGroups.length} request{filteredGroups.length === 1 ? "" : "s"}
        </span>
        <span>
          Today: {todayGroups.length} total · Successes hidden:{" "}
          {todayOnly ? todayGroups.filter((group) => isSuccessfulGroup(group)).length : sortedGroups.filter((group) => isSuccessfulGroup(group)).length}
        </span>
        {!showAll && hiddenCount > 0 ? <span>{hiddenCount} more request{hiddenCount === 1 ? "" : "s"} hidden by limit</span> : null}
      </div>

      <div className="routing-group-list">
        {visibleGroups.map((group) => {
          const tone = getGroupTone(group);
          const summary = summarizeGroup(group);

          return (
            <details key={group.requestGroupKey} className={`routing-group routing-group-${tone}`}>
              <summary className="routing-group-summary">
                <div className="routing-group-primary">
                  <p className="routing-group-time">{formatDateTime(group.latestRecordedAt)}</p>
                  <h3>{group.requestExcerpt}</h3>
                  <p className="muted">Session {group.sourceSessionId}</p>
                </div>
                <div className="routing-group-badges">
                  <AttemptBadge tone={tone}>{summary.completion}</AttemptBadge>
                  {summary.failureLabel !== "none" ? <AttemptBadge tone={tone}>{summary.failureLabel}</AttemptBadge> : null}
                  {summary.recoveryLabel !== "none" ? <AttemptBadge tone="warning">{summary.recoveryLabel}</AttemptBadge> : null}
                  <AttemptBadge tone={isSuccessfulGroup(group) ? "success" : "neutral"}>
                    {group.attempts.length} attempt{group.attempts.length === 1 ? "" : "s"}
                  </AttemptBadge>
                </div>
              </summary>

              <div className="routing-group-body">
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Recorded</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Mechanism</th>
                        <th>Accepted</th>
                        <th>Completion</th>
                        <th>Failure</th>
                        <th>Recovery</th>
                        <th>Child session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.attempts.map((attempt) => {
                        const attemptTone = getAttemptTone(attempt);
                        return (
                          <tr key={attempt.routingId} className={`routing-row routing-row-${attemptTone}`}>
                            <td>{formatDateTime(attempt.recordedAt)}</td>
                            <td>
                              <div>{attempt.expectedTargetAgent ?? "none"}</div>
                              <div className="muted">{attempt.policyDomain ?? "unknown policy"}</div>
                            </td>
                            <td>
                              <div>{attempt.actualTargetAgent ?? "none"}</div>
                              <div className="muted">{attempt.complianceStatus}</div>
                            </td>
                            <td>{attempt.mechanism}</td>
                            <td>{formatAccepted(attempt.accepted)}</td>
                            <td>
                              <div>{attempt.status}</div>
                              <div className="muted">{attempt.completionSummary ?? "none"}</div>
                            </td>
                            <td>{attempt.failureMode}</td>
                            <td>{attempt.recoveryMode}</td>
                            <td>
                              <div>{attempt.childSessionKey ?? "none"}</div>
                              <div className="muted">{attempt.childSessionId ?? attempt.runId ?? "no child session"}</div>
                              <details className="routing-details">
                                <summary>Evidence</summary>
                                <pre>{attempt.rawJson}</pre>
                              </details>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          );
        })}

        {visibleGroups.length === 0 ? (
          <div className="routing-empty">
            <p>No routing requests match the current filters.</p>
            <p className="muted">Try turning off `Today only` or enabling `Include successful`.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
