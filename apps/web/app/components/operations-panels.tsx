"use client";

import type { ReactNode } from "react";
import { ActionButton } from "./action-button";
import { useState } from "react";
import { formatDisplayDateTime } from "../lib/date-format";

type DashboardCronRun = {
  runId: string;
  jobId: string;
  ts: number;
  status: string;
  action: string;
  summary: string | null;
  deliveryStatus: string | null;
  sessionId: string | null;
  sessionKey: string | null;
  runAtMs: number | null;
  durationMs: number | null;
  nextRunAtMs: number | null;
  model: string | null;
  provider: string | null;
  recordedAt: string;
  rawJson: string;
};

type DashboardRuntimeTask = {
  taskId: string;
  status: string;
  runtime: string | null;
  agentId: string | null;
  label: string | null;
  ownerKey: string | null;
  sourceId: string | null;
  runId: string | null;
  deliveryStatus: string | null;
  terminalSummary: string | null;
  terminalOutcome: string | null;
  createdAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  lastEventAt: number | null;
  cleanupAfter: number | null;
  activityAtMs: number | null;
  recordedAt: string;
  rawJson: string;
};

type DashboardFlow = {
  flowId: string;
  syncMode: string | null;
  controllerId: string | null;
  status: string;
  ownerKey: string | null;
  goal: string | null;
  currentStep: string | null;
  blockedTaskId: string | null;
  blockedSummary: string | null;
  createdAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  lastEventAt: number | null;
  activityAtMs: number | null;
  recordedAt: string;
  rawJson: string;
};

type PanelProps<T> = {
  items: T[];
};

function formatDateTime(value: string | number | null) {
  return formatDisplayDateTime(value);
}

function formatDuration(value: number | null) {
  if (value == null || value <= 0) {
    return null;
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function isSameLocalDay(value: string | number | null, reference: Date) {
  if (value == null) {
    return false;
  }
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

function countHiddenSuccessful<T>(items: T[], isSuccessful: (item: T) => boolean) {
  return items.filter((item) => isSuccessful(item)).length;
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

function PanelControls<T>({
  items,
  noun,
  todayOnly,
  setTodayOnly,
  showSuccessful,
  setShowSuccessful,
  showAll,
  setShowAll,
  isSuccessful,
  getTimestamp,
}: {
  items: T[];
  noun: string;
  todayOnly: boolean;
  setTodayOnly: (value: boolean | ((current: boolean) => boolean)) => void;
  showSuccessful: boolean;
  setShowSuccessful: (value: boolean | ((current: boolean) => boolean)) => void;
  showAll: boolean;
  setShowAll: (value: boolean | ((current: boolean) => boolean)) => void;
  isSuccessful: (item: T) => boolean;
  getTimestamp: (item: T) => string | number | null;
}) {
  const today = new Date();
  const todayItems = items.filter((item) => isSameLocalDay(getTimestamp(item), today));
  const filteredItems = items.filter((item) => {
    if (todayOnly && !isSameLocalDay(getTimestamp(item), today)) {
      return false;
    }
    if (!showSuccessful && isSuccessful(item)) {
      return false;
    }
    return true;
  });
  const visibleCount = showAll ? filteredItems.length : Math.min(filteredItems.length, 5);
  const hiddenCount = Math.max(filteredItems.length - visibleCount, 0);
  const hiddenSuccessful = countHiddenSuccessful(todayOnly ? todayItems : items, isSuccessful);

  return (
    <>
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
          Showing {visibleCount} of {filteredItems.length} {noun}
          {filteredItems.length === 1 ? "" : "s"}
        </span>
        <span>
          Today: {todayItems.length} total · Successes hidden: {hiddenSuccessful}
        </span>
        {!showAll && hiddenCount > 0 ? (
          <span>
            {hiddenCount} more {noun}
            {hiddenCount === 1 ? "" : "s"} hidden by limit
          </span>
        ) : null}
      </div>
    </>
  );
}

function useFilteredItems<T>({
  items,
  isSuccessful,
  getTimestamp,
}: {
  items: T[];
  isSuccessful: (item: T) => boolean;
  getTimestamp: (item: T) => string | number | null;
}) {
  const [todayOnly, setTodayOnly] = useState(true);
  const [showSuccessful, setShowSuccessful] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const today = new Date();

  const filteredItems = items.filter((item) => {
    if (todayOnly && !isSameLocalDay(getTimestamp(item), today)) {
      return false;
    }
    if (!showSuccessful && isSuccessful(item)) {
      return false;
    }
    return true;
  });

  return {
    todayOnly,
    setTodayOnly,
    showSuccessful,
    setShowSuccessful,
    showAll,
    setShowAll,
    visibleItems: showAll ? filteredItems : filteredItems.slice(0, 5),
  };
}

function getCronRunTone(run: DashboardCronRun) {
  if (run.status === "error") {
    return "error" as const;
  }
  if (run.deliveryStatus && run.deliveryStatus !== "ok") {
    return "warning" as const;
  }
  return "success" as const;
}

function isSuccessfulCronRun(run: DashboardCronRun) {
  return run.status === "ok";
}

function getRuntimeTaskTone(task: DashboardRuntimeTask) {
  if (task.status === "failed") {
    return "error" as const;
  }
  if (task.status === "queued" || task.status === "running") {
    return "warning" as const;
  }
  return "success" as const;
}

function isSuccessfulRuntimeTask(task: DashboardRuntimeTask) {
  return task.status === "succeeded";
}

function getFlowTone(flow: DashboardFlow) {
  if (flow.status === "failed") {
    return "error" as const;
  }
  if (
    flow.status === "queued" ||
    flow.status === "running" ||
    flow.status === "waiting" ||
    flow.status === "awaiting_approval" ||
    flow.status === "cancelled"
  ) {
    return "warning" as const;
  }
  return "success" as const;
}

function isSuccessfulFlow(flow: DashboardFlow) {
  return flow.status === "succeeded";
}

const APPROVABLE_FLOW_CONTROLLERS = new Set(["invoice/monthly-client-invoice"]);
const DELETABLE_FLOW_CONTROLLERS = new Set(["invoice/monthly-client-invoice"]);
const ACTIVE_FLOW_STATUSES = new Set(["queued", "running", "waiting", "approved"]);
const DELETABLE_FLOW_STATUSES = new Set(["awaiting_approval", "succeeded", "completed", "failed", "cancelled"]);

function canApproveFlow(flow: DashboardFlow) {
  return Boolean(flow.controllerId && APPROVABLE_FLOW_CONTROLLERS.has(flow.controllerId) && flow.status === "awaiting_approval");
}

function canDeleteFlow(flow: DashboardFlow) {
  return Boolean(flow.controllerId && DELETABLE_FLOW_CONTROLLERS.has(flow.controllerId) && DELETABLE_FLOW_STATUSES.has(flow.status));
}

function canCancelFlow(flow: DashboardFlow) {
  return ACTIVE_FLOW_STATUSES.has(flow.status);
}

export function CronRunsPanel({ items }: PanelProps<DashboardCronRun>) {
  const sortedItems = [...items].sort((left, right) => right.ts - left.ts);
  const filters = useFilteredItems({
    items: sortedItems,
    isSuccessful: isSuccessfulCronRun,
    getTimestamp: (item) => item.ts,
  });

  return (
    <div className="routing-panel-shell">
      <PanelControls
        items={sortedItems}
        noun="run"
        todayOnly={filters.todayOnly}
        setTodayOnly={filters.setTodayOnly}
        showSuccessful={filters.showSuccessful}
        setShowSuccessful={filters.setShowSuccessful}
        showAll={filters.showAll}
        setShowAll={filters.setShowAll}
        isSuccessful={isSuccessfulCronRun}
        getTimestamp={(item) => item.ts}
      />

      <div className="routing-group-list">
        {filters.visibleItems.map((run) => {
          const tone = getCronRunTone(run);
          return (
            <details key={run.runId} className={`routing-group routing-group-${tone}`}>
              <summary className="routing-group-summary">
                <div className="routing-group-primary">
                  <p className="routing-group-time">{formatDateTime(run.ts)}</p>
                  <h3>{run.jobId}</h3>
                  <p className="muted">{run.action}</p>
                </div>
                <div className="routing-group-badges">
                  <AttemptBadge tone={tone}>{run.status}</AttemptBadge>
                  {run.deliveryStatus ? <AttemptBadge tone={run.deliveryStatus === "ok" ? "success" : "warning"}>{run.deliveryStatus}</AttemptBadge> : null}
                  {formatDuration(run.durationMs) ? <AttemptBadge tone="neutral">{formatDuration(run.durationMs)}</AttemptBadge> : null}
                </div>
              </summary>

              <div className="routing-group-body">
                <div className="ops-grid">
                  <div className="ops-field">
                    <span className="ops-label">Run ID</span>
                    <span>{run.runId}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Model</span>
                    <span>{run.model ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Provider</span>
                    <span>{run.provider ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Session</span>
                    <span>{run.sessionKey ?? run.sessionId ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Started</span>
                    <span>{formatDateTime(run.runAtMs)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Next Run</span>
                    <span>{formatDateTime(run.nextRunAtMs)}</span>
                  </div>
                </div>
                <p className="ops-copy">{run.summary ?? "No summary recorded."}</p>
                <details className="routing-details">
                  <summary>Raw run</summary>
                  <pre>{run.rawJson}</pre>
                </details>
              </div>
            </details>
          );
        })}

        {filters.visibleItems.length === 0 ? (
          <div className="routing-empty">
            <p>No cron runs match the current filters.</p>
            <p className="muted">Try turning off `Today only` or enabling `Include successful`.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RuntimeTasksPanel({ items }: PanelProps<DashboardRuntimeTask>) {
  const sortedItems = [...items].sort((left, right) => (right.activityAtMs ?? 0) - (left.activityAtMs ?? 0));
  const filters = useFilteredItems({
    items: sortedItems,
    isSuccessful: isSuccessfulRuntimeTask,
    getTimestamp: (item) => item.activityAtMs ?? item.createdAt,
  });

  return (
    <div className="routing-panel-shell">
      <PanelControls
        items={sortedItems}
        noun="task"
        todayOnly={filters.todayOnly}
        setTodayOnly={filters.setTodayOnly}
        showSuccessful={filters.showSuccessful}
        setShowSuccessful={filters.setShowSuccessful}
        showAll={filters.showAll}
        setShowAll={filters.setShowAll}
        isSuccessful={isSuccessfulRuntimeTask}
        getTimestamp={(item) => item.activityAtMs ?? item.createdAt}
      />

      <div className="routing-group-list">
        {filters.visibleItems.map((task) => {
          const tone = getRuntimeTaskTone(task);
          const cancellable = task.status === "queued" || task.status === "running";
          return (
            <details key={task.taskId} className={`routing-group routing-group-${tone}`}>
              <summary className="routing-group-summary">
                <div className="routing-group-primary">
                  <p className="routing-group-time">{formatDateTime(task.activityAtMs ?? task.createdAt)}</p>
                  <h3>{task.label ?? task.taskId}</h3>
                  <p className="muted">
                    Task {task.taskId} · Agent {task.agentId ?? "none"}
                  </p>
                </div>
                <div className="routing-group-badges">
                  <AttemptBadge tone={tone}>{task.status}</AttemptBadge>
                  {task.runtime ? <AttemptBadge tone="neutral">{task.runtime}</AttemptBadge> : null}
                  {task.deliveryStatus ? <AttemptBadge tone="neutral">{task.deliveryStatus}</AttemptBadge> : null}
                  {task.terminalOutcome ? <AttemptBadge tone={task.terminalOutcome === "blocked" ? "warning" : "success"}>{task.terminalOutcome}</AttemptBadge> : null}
                </div>
              </summary>

              <div className="routing-group-body">
                <div className="ops-grid">
                  <div className="ops-field">
                    <span className="ops-label">Owner</span>
                    <span>{task.ownerKey ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Source</span>
                    <span>{task.sourceId ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Run ID</span>
                    <span>{task.runId ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Created</span>
                    <span>{formatDateTime(task.createdAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Started</span>
                    <span>{formatDateTime(task.startedAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Last Event</span>
                    <span>{formatDateTime(task.lastEventAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Ended</span>
                    <span>{formatDateTime(task.endedAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Cleanup After</span>
                    <span>{formatDateTime(task.cleanupAfter)}</span>
                  </div>
                  {task.terminalOutcome ? (
                    <div className="ops-field">
                      <span className="ops-label">Outcome</span>
                      <span>{task.terminalOutcome}</span>
                    </div>
                  ) : null}
                </div>
                <p className="ops-copy">{task.terminalSummary ?? "No terminal summary recorded."}</p>
                <div className="ops-action-row">
                  {cancellable ? (
                    <ActionButton
                      endpoint="/api/actions/cancel-task"
                      label="Cancel"
                      body={{ lookup: task.taskId }}
                      confirmText={`Cancel runtime task ${task.taskId}?`}
                    />
                  ) : (
                    <span className="muted">not active</span>
                  )}
                </div>
                <details className="routing-details">
                  <summary>Raw task</summary>
                  <pre>{task.rawJson}</pre>
                </details>
              </div>
            </details>
          );
        })}

        {filters.visibleItems.length === 0 ? (
          <div className="routing-empty">
            <p>No runtime tasks match the current filters.</p>
            <p className="muted">Try turning off `Today only` or enabling `Include successful`.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TaskFlowsPanel({ items }: PanelProps<DashboardFlow>) {
  const sortedItems = [...items].sort((left, right) => (right.activityAtMs ?? 0) - (left.activityAtMs ?? 0));
  const filters = useFilteredItems({
    items: sortedItems,
    isSuccessful: isSuccessfulFlow,
    getTimestamp: (item) => item.activityAtMs ?? item.recordedAt,
  });

  return (
    <div className="routing-panel-shell">
      <PanelControls
        items={sortedItems}
        noun="flow"
        todayOnly={filters.todayOnly}
        setTodayOnly={filters.setTodayOnly}
        showSuccessful={filters.showSuccessful}
        setShowSuccessful={filters.setShowSuccessful}
        showAll={filters.showAll}
        setShowAll={filters.setShowAll}
        isSuccessful={isSuccessfulFlow}
        getTimestamp={(item) => item.activityAtMs ?? item.recordedAt}
      />

      <div className="routing-group-list">
        {filters.visibleItems.map((flow) => {
          const tone = getFlowTone(flow);
          const approvable = canApproveFlow(flow);
          const deletable = canDeleteFlow(flow);
          const cancellable = canCancelFlow(flow);
          const hasActions = approvable || deletable || cancellable;
          return (
            <details key={flow.flowId} className={`routing-group routing-group-${tone}`}>
              <summary className="routing-group-summary">
                <div className="routing-group-primary">
                  <p className="routing-group-time">{formatDateTime(flow.activityAtMs ?? flow.recordedAt)}</p>
                  <h3>{flow.goal ?? flow.flowId}</h3>
                  <p className="muted">
                    Flow {flow.flowId} · Owner {flow.ownerKey ?? "none"} · Controller {flow.controllerId ?? "generic"}
                  </p>
                </div>
                <div className="routing-group-badges">
                  <AttemptBadge tone={tone}>{flow.status}</AttemptBadge>
                  {flow.syncMode ? <AttemptBadge tone="neutral">{flow.syncMode}</AttemptBadge> : null}
                  {flow.currentStep ? <AttemptBadge tone="neutral">{flow.currentStep}</AttemptBadge> : null}
                  {flow.blockedTaskId ? <AttemptBadge tone="warning">blocked</AttemptBadge> : null}
                </div>
              </summary>

              <div className="routing-group-body">
                <div className="ops-grid">
                  <div className="ops-field">
                    <span className="ops-label">Controller</span>
                    <span>{flow.controllerId ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Sync Mode</span>
                    <span>{flow.syncMode ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Flow ID</span>
                    <span>{flow.flowId}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Owner</span>
                    <span>{flow.ownerKey ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Current Step</span>
                    <span>{flow.currentStep ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Blocked Task</span>
                    <span>{flow.blockedTaskId ?? "none"}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Created</span>
                    <span>{formatDateTime(flow.createdAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Started</span>
                    <span>{formatDateTime(flow.startedAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Last Event</span>
                    <span>{formatDateTime(flow.lastEventAt)}</span>
                  </div>
                  <div className="ops-field">
                    <span className="ops-label">Ended</span>
                    <span>{formatDateTime(flow.endedAt)}</span>
                  </div>
                </div>
                <p className="ops-copy">{flow.blockedSummary ?? "No blocked summary recorded."}</p>
                <div className="ops-action-row">
                  {approvable ? (
                    <ActionButton
                      endpoint="/api/actions/approve-flow"
                      label="Approve"
                      body={{ lookup: flow.flowId, controllerId: flow.controllerId ?? "" }}
                      confirmText={`Approve flow ${flow.flowId} and continue execution?`}
                    />
                  ) : null}
                  {deletable ? (
                    <ActionButton
                      endpoint="/api/actions/delete-flow"
                      label="Delete"
                      body={{ lookup: flow.flowId, controllerId: flow.controllerId ?? "" }}
                      confirmText={`Delete flow ${flow.flowId} and remove its generated artifacts?`}
                    />
                  ) : null}
                  {cancellable ? (
                    <ActionButton
                      endpoint="/api/actions/cancel-flow"
                      label="Cancel"
                      body={{ lookup: flow.flowId }}
                      confirmText={`Cancel flow ${flow.flowId}?`}
                    />
                  ) : null}
                  {!hasActions ? <span className="muted">read-only for this state/controller</span> : null}
                </div>
                <details className="routing-details">
                  <summary>Raw flow</summary>
                  <pre>{flow.rawJson}</pre>
                </details>
              </div>
            </details>
          );
        })}

        {filters.visibleItems.length === 0 ? (
          <div className="routing-empty">
            <p>No TaskFlows match the current filters.</p>
            <p className="muted">Try turning off `Today only` or enabling `Include successful`.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
