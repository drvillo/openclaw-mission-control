"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { startTransition, useEffect, useState } from "react";
import { CompactSelect, type CompactSelectOption } from "./compact-select";
import { formatDisplayDate } from "../lib/date-format";

type TaskIssue = {
  code: string;
  message: string;
  line: number;
};

type BoardTask = {
  title: string;
  checked: boolean;
  line: number;
  id: string;
  status: string;
  owner: string;
  assignee_type: string;
  assignee: string;
  agent_status: string;
  created_on: string;
  remind_on: string;
  run_id: string;
  flow_id: string;
  details_ref: string;
  results_ref: string;
  log_ref: string;
  detail_path: string | null;
  detail_exists: boolean;
  detail_sections: {
    request: string;
    acceptance_criteria: string;
    execution_log: string;
    results: string;
  };
  detail_triage: {
    owner: string | null;
    next_action: string | null;
    blocked_on: string | null;
    decision_by: string | null;
  };
  detail_body: string | null;
  lint_errors: TaskIssue[];
  lint_warnings: TaskIssue[];
};

type TasksBoardProps = {
  tasks: BoardTask[];
};

type TaskDraft = {
  title: string;
  status: string;
  owner: string;
  assigneeType: string;
  assignee: string;
  agentStatus: string;
  createdOn: string;
  remindOn: string;
  runId: string;
  flowId: string;
  request: string;
  acceptanceCriteria: string;
  executionLog: string;
  results: string;
  triageOwner: string;
  nextAction: string;
  blockedOn: string;
  decisionBy: string;
};

const STATUS_COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "inbox", label: "Inbox" },
  { id: "next", label: "Next" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Done" },
] as const;

const AGENT_STATUS_OPTIONS = ["none", "queued", "running", "blocked", "review_needed", "done", "failed"];
const ASSIGNEE_TYPE_OPTIONS = ["human", "agent"];

const STATUS_SELECT_OPTIONS: CompactSelectOption[] = STATUS_COLUMNS.map((status) => ({
  value: status.id,
  label: status.label,
}));

const ASSIGNEE_TYPE_SELECT_OPTIONS: CompactSelectOption[] = ASSIGNEE_TYPE_OPTIONS.map((value) => ({
  value,
  label: value,
}));

const AGENT_STATUS_SELECT_OPTIONS: CompactSelectOption[] = AGENT_STATUS_OPTIONS.map((value) => ({
  value,
  label: value,
}));

function formatDate(value: string | null) {
  return formatDisplayDate(value, "none");
}

function parseIsoDate(value: string) {
  if (!value || value === "none") {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isToday(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return false;
  }
  const today = new Date();
  return (
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate()
  );
}

function isThisWeek(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return false;
  }
  const today = new Date();
  const start = new Date(today);
  const day = (today.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return parsed >= start && parsed < end;
}

function uniqueValues(tasks: BoardTask[], key: "owner" | "assignee_type" | "assignee" | "agent_status") {
  return [...new Set(tasks.map((task) => task[key]).filter((value) => value && value !== "none"))].sort();
}

function TaskBadge({ tone, children }: { tone: "hot" | "neutral" | "warning" | "error"; children: ReactNode }) {
  return <span className={`task-badge task-badge-${tone}`}>{children}</span>;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconButton({
  label,
  title,
  icon,
  tone = "neutral",
  disabled,
  onClick,
}: {
  label: string;
  title?: string;
  icon: ReactNode;
  tone?: "neutral" | "danger" | "success";
  disabled?: boolean;
  onClick: () => void;
}) {
  function stopCardEvent(event: SyntheticEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <button
      type="button"
      className={`task-icon-button task-icon-button-${tone}`}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onMouseDown={stopCardEvent}
      onPointerDown={stopCardEvent}
      onDragStart={stopCardEvent}
    >
      {icon}
    </button>
  );
}

function moveSummary(status: string) {
  switch (status) {
    case "done":
      return "Completed";
    case "waiting":
      return "Waiting";
    case "backlog":
      return "Backlogged";
    case "next":
      return "Ready";
    default:
      return "Inbox";
  }
}

function toDraft(task: BoardTask): TaskDraft {
  return {
    title: task.title,
    status: task.status,
    owner: task.owner,
    assigneeType: task.assignee_type,
    assignee: task.assignee,
    agentStatus: task.agent_status,
    createdOn: task.created_on === "none" ? "" : task.created_on,
    remindOn: task.remind_on === "none" ? "" : task.remind_on,
    runId: task.run_id === "none" ? "" : task.run_id,
    flowId: task.flow_id === "none" ? "" : task.flow_id,
    request: task.detail_sections.request ?? "",
    acceptanceCriteria: task.detail_sections.acceptance_criteria ?? "",
    executionLog: task.detail_sections.execution_log ?? "",
    results: task.detail_sections.results ?? "",
    triageOwner: task.detail_triage.owner ?? "",
    nextAction: task.detail_triage.next_action ?? "",
    blockedOn: task.detail_triage.blocked_on ?? "",
    decisionBy: task.detail_triage.decision_by ?? "",
  };
}

function isDraftDirty(task: BoardTask | null, draft: TaskDraft | null) {
  if (!task || !draft) {
    return false;
  }
  return JSON.stringify(toDraft(task)) !== JSON.stringify(draft);
}

function payloadValue(value: string) {
  const trimmed = value.trim();
  return trimmed || "none";
}

function detailValue(value: string) {
  return value.trim();
}

function issuesLabel(task: BoardTask) {
  const count = task.lint_errors.length + task.lint_warnings.length;
  return count > 0 ? `${count} issue${count === 1 ? "" : "s"}` : null;
}

function toOptions(values: string[], allLabel: string): CompactSelectOption[] {
  return [{ value: "all", label: allLabel }, ...values.map((value) => ({ value, label: value }))];
}

function hasDetailContent(task: BoardTask | null, draft: TaskDraft | null) {
  if (!task || !draft) {
    return false;
  }
  return Boolean(
    draft.request ||
      draft.acceptanceCriteria ||
      draft.executionLog ||
      draft.results ||
      draft.triageOwner ||
      draft.nextAction ||
      draft.blockedOn ||
      draft.decisionBy ||
      task.detail_exists,
  );
}

export function TasksBoard({ tasks }: TasksBoardProps) {
  const [items, setItems] = useState(tasks);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [assigneeTypeFilter, setAssigneeTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [agentStatusFilter, setAgentStatusFilter] = useState("all");
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [dueThisWeekOnly, setDueThisWeekOnly] = useState(false);
  const [createdTodayOnly, setCreatedTodayOnly] = useState(false);
  const [createdThisWeekOnly, setCreatedThisWeekOnly] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [activeDropStatus, setActiveDropStatus] = useState<string | null>(null);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const [pendingBulkAction, setPendingBulkAction] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setItems(tasks);
  }, [tasks]);

  const selectedTask = selectedTaskId ? items.find((task) => task.id === selectedTaskId) ?? null : null;

  useEffect(() => {
    setDraft(selectedTask ? toDraft(selectedTask) : null);
  }, [selectedTaskId, selectedTask]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTasks = items.filter((task) => {
    if (ownerFilter !== "all" && task.owner !== ownerFilter) {
      return false;
    }
    if (assigneeTypeFilter !== "all" && task.assignee_type !== assigneeTypeFilter) {
      return false;
    }
    if (assigneeFilter !== "all" && task.assignee !== assigneeFilter) {
      return false;
    }
    if (agentStatusFilter !== "all" && task.agent_status !== agentStatusFilter) {
      return false;
    }
    if (dueTodayOnly && !isToday(task.remind_on)) {
      return false;
    }
    if (dueThisWeekOnly && !isThisWeek(task.remind_on)) {
      return false;
    }
    if (createdTodayOnly && !isToday(task.created_on)) {
      return false;
    }
    if (createdThisWeekOnly && !isThisWeek(task.created_on)) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    const haystack = [
      task.id,
      task.title,
      task.owner,
      task.assignee,
      task.agent_status,
      task.flow_id,
      task.run_id,
      task.detail_body ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    ownerFilter !== "all" ||
    assigneeTypeFilter !== "all" ||
    assigneeFilter !== "all" ||
    agentStatusFilter !== "all" ||
    dueTodayOnly ||
    dueThisWeekOnly ||
    createdTodayOnly ||
    createdThisWeekOnly;

  function resetFilters() {
    setOwnerFilter("all");
    setAssigneeTypeFilter("all");
    setAssigneeFilter("all");
    setAgentStatusFilter("all");
    setDueTodayOnly(false);
    setDueThisWeekOnly(false);
    setCreatedTodayOnly(false);
    setCreatedThisWeekOnly(false);
    setSearch("");
  }

  const groupedTasks = STATUS_COLUMNS.map((column) => ({
    ...column,
    tasks: filteredTasks
      .filter((task) => task.status === column.id)
      .sort((left, right) => right.created_on.localeCompare(left.created_on) || right.id.localeCompare(left.id)),
  }));

  const ownerOptions = toOptions(uniqueValues(items, "owner"), "All owners");
  const assigneeTypeOptions = toOptions(uniqueValues(items, "assignee_type"), "All assignee types");
  const assigneeOptions = toOptions(uniqueValues(items, "assignee"), "All assignees");
  const agentStatusOptions = toOptions(uniqueValues(items, "agent_status"), "All agent statuses");

  function closeModal() {
    if (selectedTask && draft && isDraftDirty(selectedTask, draft) && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    setSelectedTaskId(null);
    setDraft(null);
  }

  function applySavedTask(saved: BoardTask) {
    setItems((current) => current.map((task) => (task.id === saved.id ? saved : task)));
    setSelectedTaskId(saved.id);
  }

  function applySavedTasks(saved: BoardTask[]) {
    if (saved.length === 0) {
      return;
    }
    const savedById = new Map(saved.map((task) => [task.id, task]));
    setItems((current) => current.map((task) => savedById.get(task.id) ?? task));
  }

  function setTaskActionPending(ids: string[], isPending: boolean) {
    setPendingActionIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (isPending) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }

  async function moveTask(taskId: string, nextStatus: string) {
    const task = items.find((entry) => entry.id === taskId);
    if (!task || task.status === nextStatus) {
      return;
    }
    const previousItems = items;
    const optimisticItems = items.map((entry) =>
      entry.id === taskId
        ? {
            ...entry,
            status: nextStatus,
            checked: nextStatus === "done",
          }
        : entry,
    );

    setItems(optimisticItems);
    setPendingMoveId(taskId);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/actions/move-obsidian-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status: nextStatus }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          summary?: string;
          error?: string;
          payload?: { saved?: BoardTask };
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        if (payload.payload?.saved) {
          applySavedTask(payload.payload.saved);
        }
        setMessage(payload.summary ?? `Moved task to ${moveSummary(nextStatus)}`);
      } catch (error) {
        setItems(previousItems);
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingMoveId(null);
        setActiveDropStatus(null);
      }
    });
  }

  async function archiveTasks(taskIds: string[], confirmMessage?: string) {
    const ids = [...new Set(taskIds)].filter((id) => items.some((task) => task.id === id));
    if (ids.length === 0 || pendingBulkAction) {
      return;
    }
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    const previousItems = items;
    const previousSelectedTaskId = selectedTaskId;
    const idSet = new Set(ids);

    setItems(items.filter((task) => !idSet.has(task.id)));
    if (selectedTaskId && idSet.has(selectedTaskId)) {
      setSelectedTaskId(null);
      setDraft(null);
    }
    setTaskActionPending(ids, true);
    setPendingBulkAction(confirmMessage ? "archive" : null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/actions/archive-obsidian-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          summary?: string;
          error?: string;
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        setMessage(payload.summary ?? `Archived ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      } catch (error) {
        setItems(previousItems);
        setSelectedTaskId(previousSelectedTaskId);
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setTaskActionPending(ids, false);
        setPendingBulkAction(null);
      }
    });
  }

  async function markTasksDone(taskIds: string[], confirmMessage?: string) {
    const ids = [...new Set(taskIds)].filter((id) => items.some((task) => task.id === id && task.status === "next"));
    if (ids.length === 0 || pendingBulkAction) {
      return;
    }
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    const previousItems = items;
    const idSet = new Set(ids);
    const optimisticItems = items.map((task) =>
      idSet.has(task.id)
        ? {
            ...task,
            status: "done",
            checked: true,
          }
        : task,
    );

    setItems(optimisticItems);
    setTaskActionPending(ids, true);
    setPendingBulkAction(confirmMessage ? "done" : null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/actions/mark-obsidian-tasks-done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          summary?: string;
          error?: string;
          payload?: { saved?: BoardTask[] };
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        applySavedTasks(payload.payload?.saved ?? []);
        setMessage(payload.summary ?? `Marked ${ids.length} task${ids.length === 1 ? "" : "s"} done`);
      } catch (error) {
        setItems(previousItems);
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setTaskActionPending(ids, false);
        setPendingBulkAction(null);
      }
    });
  }

  async function saveTask() {
    if (!selectedTask || !draft) {
      return;
    }
    setSavingTask(true);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/actions/save-obsidian-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedTask.id,
            title: draft.title,
            status: draft.status,
            owner: payloadValue(draft.owner),
            assignee_type: payloadValue(draft.assigneeType),
            assignee: payloadValue(draft.assignee),
            agent_status: payloadValue(draft.agentStatus),
            created_on: payloadValue(draft.createdOn),
            remind_on: payloadValue(draft.remindOn),
            run_id: payloadValue(draft.runId),
            flow_id: payloadValue(draft.flowId),
            request: detailValue(draft.request),
            acceptance_criteria: detailValue(draft.acceptanceCriteria),
            execution_log: detailValue(draft.executionLog),
            results: detailValue(draft.results),
            triage: {
              owner: detailValue(draft.triageOwner) || undefined,
              next_action: detailValue(draft.nextAction) || undefined,
              blocked_on: detailValue(draft.blockedOn) || undefined,
              decision_by: detailValue(draft.decisionBy) || undefined,
            },
            ensure_detail_note:
              Boolean(detailValue(draft.request)) ||
              Boolean(detailValue(draft.acceptanceCriteria)) ||
              Boolean(detailValue(draft.executionLog)) ||
              Boolean(detailValue(draft.results)) ||
              Boolean(detailValue(draft.triageOwner)) ||
              Boolean(detailValue(draft.nextAction)) ||
              Boolean(detailValue(draft.blockedOn)) ||
              Boolean(detailValue(draft.decisionBy)),
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          summary?: string;
          error?: string;
          payload?: { saved?: BoardTask };
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        if (payload.payload?.saved) {
          applySavedTask(payload.payload.saved);
        }
        setMessage(payload.summary ?? `Saved ${selectedTask.id}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setSavingTask(false);
      }
    });
  }

  return (
    <div className="tasks-board-shell">
      <div className="task-filters">
        <div className="task-filters-row task-filters-row-primary">
          <label className="task-search">
            <span className="sr-only">Search tasks</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks, owners, runs, flows"
            />
          </label>
          <div className="task-filter-selects">
            <CompactSelect value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} ariaLabel="Owner filter" className="compact-select-filter" />
            <CompactSelect
              value={assigneeTypeFilter}
              options={assigneeTypeOptions}
              onChange={setAssigneeTypeFilter}
              ariaLabel="Assignee type filter"
              className="compact-select-filter"
            />
            <CompactSelect value={assigneeFilter} options={assigneeOptions} onChange={setAssigneeFilter} ariaLabel="Assignee filter" className="compact-select-filter" />
            <CompactSelect
              value={agentStatusFilter}
              options={agentStatusOptions}
              onChange={setAgentStatusFilter}
              ariaLabel="Agent status filter"
              className="compact-select-filter"
            />
          </div>
        </div>

        <div className="task-filters-row task-filters-row-secondary">
          <label className={`task-chip ${dueTodayOnly ? "task-chip-active" : ""}`}>
            <input type="checkbox" checked={dueTodayOnly} onChange={() => setDueTodayOnly((value) => !value)} />
            <span>Due today</span>
          </label>
          <label className={`task-chip ${dueThisWeekOnly ? "task-chip-active" : ""}`}>
            <input type="checkbox" checked={dueThisWeekOnly} onChange={() => setDueThisWeekOnly((value) => !value)} />
            <span>Due this week</span>
          </label>
          <label className={`task-chip ${createdTodayOnly ? "task-chip-active" : ""}`}>
            <input type="checkbox" checked={createdTodayOnly} onChange={() => setCreatedTodayOnly((value) => !value)} />
            <span>Created today</span>
          </label>
          <label className={`task-chip ${createdThisWeekOnly ? "task-chip-active" : ""}`}>
            <input type="checkbox" checked={createdThisWeekOnly} onChange={() => setCreatedThisWeekOnly((value) => !value)} />
            <span>Created this week</span>
          </label>
          <button
            type="button"
            className={`task-chip task-chip-clear ${hasActiveFilters ? "" : "task-chip-active"}`}
            onClick={resetFilters}
          >
            See all
          </button>
        </div>
      </div>

      <div className="routing-toolbar-meta">
        <span>
          Showing {filteredTasks.length} of {items.length} task{items.length === 1 ? "" : "s"}
        </span>
        {message ? <span>{message}</span> : null}
        {pendingMoveId ? <span>Saving move for {pendingMoveId}...</span> : null}
      </div>

      <div className="tasks-board">
        {groupedTasks.map((column) => {
          const columnTaskIds = column.tasks.map((task) => task.id);
          const columnActionDisabled = columnTaskIds.length === 0 || pendingBulkAction !== null;
          return (
          <section
            key={column.id}
            className={`task-column ${activeDropStatus === column.id ? "task-column-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setActiveDropStatus(column.id);
            }}
            onDragLeave={() => {
              setActiveDropStatus((current) => (current === column.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData("text/task-id");
              void moveTask(taskId, column.id);
            }}
          >
            <header className="task-column-header">
              <div>
                <h3>{column.label}</h3>
                <p className="muted">{column.tasks.length} task{column.tasks.length === 1 ? "" : "s"}</p>
              </div>
              <div className="task-column-actions">
                {column.id === "next" ? (
                  <IconButton
                    label={`Mark all visible ${column.label.toLowerCase()} tasks done`}
                    title="Mark visible tasks done"
                    icon={<CheckIcon />}
                    tone="success"
                    disabled={columnActionDisabled}
                    onClick={() =>
                      void markTasksDone(
                        columnTaskIds,
                        `Mark ${column.tasks.length} visible ${column.label.toLowerCase()} task${column.tasks.length === 1 ? "" : "s"} done?`,
                      )
                    }
                  />
                ) : null}
                <IconButton
                  label={`Archive all visible ${column.label.toLowerCase()} tasks`}
                  title="Archive visible tasks"
                  icon={<TrashIcon />}
                  tone="danger"
                  disabled={columnActionDisabled}
                  onClick={() =>
                    void archiveTasks(
                      columnTaskIds,
                      `Archive ${column.tasks.length} visible ${column.label.toLowerCase()} task${column.tasks.length === 1 ? "" : "s"}?`,
                    )
                  }
                />
              </div>
            </header>

            <div className="task-column-body">
              {column.tasks.map((task) => {
                const taskActionDisabled = pendingActionIds.has(task.id) || pendingMoveId === task.id || pendingBulkAction !== null;
                return (
                <article
                  key={task.id}
                  className={`task-card ${pendingMoveId === task.id ? "task-card-pending" : ""}`}
                  draggable={pendingMoveId == null && !pendingActionIds.has(task.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/task-id", task.id);
                  }}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="task-card-head">
                    <p className="task-card-id">{task.id}</p>
                    <div className="task-card-head-actions">
                      <TaskBadge tone={task.lint_errors.length > 0 ? "error" : task.agent_status === "failed" ? "warning" : "neutral"}>
                        {task.agent_status}
                      </TaskBadge>
                      {task.status === "next" ? (
                        <IconButton
                          label={`Mark ${task.id} done`}
                          title="Mark done"
                          icon={<CheckIcon />}
                          tone="success"
                          disabled={taskActionDisabled}
                          onClick={() => void markTasksDone([task.id])}
                        />
                      ) : null}
                      <IconButton
                        label={`Archive ${task.id}`}
                        title="Archive task"
                        icon={<TrashIcon />}
                        tone="danger"
                        disabled={taskActionDisabled}
                        onClick={() => void archiveTasks([task.id])}
                      />
                    </div>
                  </div>
                  <h4>{task.title}</h4>
                  <p className="muted">
                    {task.owner} · {task.assignee_type}:{task.assignee}
                  </p>
                  <div className="task-card-meta">
                    <TaskBadge tone="hot">Created {formatDate(task.created_on)}</TaskBadge>
                    {task.remind_on !== "none" ? <TaskBadge tone="warning">Due {formatDate(task.remind_on)}</TaskBadge> : null}
                    {task.flow_id !== "none" ? <TaskBadge tone="neutral">{task.flow_id}</TaskBadge> : null}
                    {task.run_id !== "none" ? <TaskBadge tone="neutral">{task.run_id}</TaskBadge> : null}
                    {issuesLabel(task) ? <TaskBadge tone="error">{issuesLabel(task)}</TaskBadge> : null}
                  </div>
                </article>
                );
              })}

              {column.tasks.length === 0 ? (
                <div className="task-column-empty">
                  <p>No tasks in {column.label.toLowerCase()}.</p>
                </div>
              ) : null}
            </div>
          </section>
          );
        })}
      </div>

      {selectedTask && draft ? (
        <div className="task-modal-backdrop" onClick={closeModal}>
          <div className="task-modal" onClick={(event) => event.stopPropagation()}>
            <div className="task-modal-header">
              <div className="task-modal-heading">
                <p className="task-card-id">{selectedTask.id}</p>
                <input
                  className="task-modal-title"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                />
                <p className="muted">Canonical Obsidian task editor.</p>
              </div>
              <div className="task-modal-actions">
                <button type="button" className="task-modal-close" onClick={closeModal}>
                  Close
                </button>
                <button type="button" className="action-trigger" onClick={() => void saveTask()} disabled={savingTask || !isDraftDirty(selectedTask, draft)}>
                  {savingTask ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className="task-modal-properties">
              <label className="task-field">
                <span className="ops-label">Status</span>
                <CompactSelect
                  value={draft.status}
                  options={STATUS_SELECT_OPTIONS}
                  onChange={(value) => setDraft((current) => (current ? { ...current, status: value } : current))}
                  ariaLabel="Task status"
                />
              </label>
              <label className="task-field">
                <span className="ops-label">Owner</span>
                <input value={draft.owner} onChange={(event) => setDraft((current) => (current ? { ...current, owner: event.target.value } : current))} className="task-input" />
              </label>
              <label className="task-field">
                <span className="ops-label">Assignee Type</span>
                <CompactSelect
                  value={draft.assigneeType}
                  options={ASSIGNEE_TYPE_SELECT_OPTIONS}
                  onChange={(value) => setDraft((current) => (current ? { ...current, assigneeType: value } : current))}
                  ariaLabel="Assignee type"
                />
              </label>
              <label className="task-field">
                <span className="ops-label">Assignee</span>
                <input value={draft.assignee} onChange={(event) => setDraft((current) => (current ? { ...current, assignee: event.target.value } : current))} className="task-input" />
              </label>
              <label className="task-field">
                <span className="ops-label">Agent Status</span>
                <CompactSelect
                  value={draft.agentStatus}
                  options={AGENT_STATUS_SELECT_OPTIONS}
                  onChange={(value) => setDraft((current) => (current ? { ...current, agentStatus: value } : current))}
                  ariaLabel="Agent status"
                />
              </label>
              <label className="task-field">
                <span className="ops-label">Created On</span>
                <input type="date" value={draft.createdOn} onChange={(event) => setDraft((current) => (current ? { ...current, createdOn: event.target.value } : current))} className="task-input" />
              </label>
              <label className="task-field">
                <span className="ops-label">Remind On</span>
                <input type="date" value={draft.remindOn} onChange={(event) => setDraft((current) => (current ? { ...current, remindOn: event.target.value } : current))} className="task-input" />
              </label>
              <label className="task-field">
                <span className="ops-label">Run ID</span>
                <input value={draft.runId} onChange={(event) => setDraft((current) => (current ? { ...current, runId: event.target.value } : current))} className="task-input" />
              </label>
              <label className="task-field">
                <span className="ops-label">Flow ID</span>
                <input value={draft.flowId} onChange={(event) => setDraft((current) => (current ? { ...current, flowId: event.target.value } : current))} className="task-input" />
              </label>
              <div className="ops-field">
                <span className="ops-label">Detail Note</span>
                <span>{hasDetailContent(selectedTask, draft) ? "visible below" : "no detail note content yet"}</span>
              </div>
            </div>

            <div className="task-modal-body">
              <section className="task-modal-section task-modal-section-accent">
                <div className="task-detail-summary">
                  <div>
                    <h4>Task Details</h4>
                    <p className="muted">
                      {selectedTask.detail_exists ? "Canonical detail note loaded into this editor." : "No detail note exists yet. Saving detail fields will create one."}
                    </p>
                  </div>
                  <div className="task-card-meta">
                    {selectedTask.results_ref !== "none" ? <TaskBadge tone="neutral">Results linked</TaskBadge> : null}
                    {selectedTask.log_ref !== "none" ? <TaskBadge tone="neutral">Log linked</TaskBadge> : null}
                    {issuesLabel(selectedTask) ? <TaskBadge tone="error">{issuesLabel(selectedTask)}</TaskBadge> : null}
                  </div>
                </div>
              </section>

              <section className="task-modal-section">
                <h4>Request</h4>
                <textarea
                  className="task-textarea"
                  value={draft.request}
                  onChange={(event) => setDraft((current) => (current ? { ...current, request: event.target.value } : current))}
                />
              </section>

              <section className="task-modal-section">
                <h4>Acceptance Criteria</h4>
                <textarea
                  className="task-textarea"
                  value={draft.acceptanceCriteria}
                  onChange={(event) => setDraft((current) => (current ? { ...current, acceptanceCriteria: event.target.value } : current))}
                />
              </section>

              <section className="task-modal-section">
                <h4>Execution Log</h4>
                <textarea
                  className="task-textarea"
                  value={draft.executionLog}
                  onChange={(event) => setDraft((current) => (current ? { ...current, executionLog: event.target.value } : current))}
                />
              </section>

              <section className="task-modal-section">
                <h4>Results</h4>
                <textarea
                  className="task-textarea"
                  value={draft.results}
                  onChange={(event) => setDraft((current) => (current ? { ...current, results: event.target.value } : current))}
                />
              </section>

              <section className="task-modal-section">
                <h4>Triage</h4>
                <div className="task-modal-properties">
                  <label className="task-field">
                    <span className="ops-label">Owner</span>
                    <input value={draft.triageOwner} onChange={(event) => setDraft((current) => (current ? { ...current, triageOwner: event.target.value } : current))} className="task-input" />
                  </label>
                  <label className="task-field">
                    <span className="ops-label">Next Action</span>
                    <input value={draft.nextAction} onChange={(event) => setDraft((current) => (current ? { ...current, nextAction: event.target.value } : current))} className="task-input" />
                  </label>
                  <label className="task-field">
                    <span className="ops-label">Blocked On</span>
                    <input value={draft.blockedOn} onChange={(event) => setDraft((current) => (current ? { ...current, blockedOn: event.target.value } : current))} className="task-input" />
                  </label>
                  <label className="task-field">
                    <span className="ops-label">Decision By</span>
                    <input value={draft.decisionBy} onChange={(event) => setDraft((current) => (current ? { ...current, decisionBy: event.target.value } : current))} className="task-input" />
                  </label>
                </div>
              </section>

              {selectedTask.lint_errors.length > 0 || selectedTask.lint_warnings.length > 0 ? (
                <section className="task-modal-section">
                  <h4>Lint</h4>
                  <div className="task-issues">
                    {selectedTask.lint_errors.map((issue) => (
                      <p key={`error-${issue.code}-${issue.line}`} className="task-issue task-issue-error">
                        {issue.code}: {issue.message}
                      </p>
                    ))}
                    {selectedTask.lint_warnings.map((issue) => (
                      <p key={`warning-${issue.code}-${issue.line}`} className="task-issue task-issue-warning">
                        {issue.code}: {issue.message}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <details className="routing-details">
                <summary>Raw detail note and references</summary>
                <div className="task-raw-meta">
                  <p>
                    <strong>Results ref:</strong> {selectedTask.results_ref}
                  </p>
                  <p>
                    <strong>Log ref:</strong> {selectedTask.log_ref}
                  </p>
                </div>
                <pre>{selectedTask.detail_body ?? "No detail note available."}</pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
