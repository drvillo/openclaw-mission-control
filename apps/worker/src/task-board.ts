import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TaskSnapshot } from "@ocmc/shared";
import { OPENCLAW_HOME, TASK_BOARD_WRAPPER, TASKS_ROOT } from "./config";

const TASK_LINE_RE = /^- \[([ xX])\] (.+)$/;
const FIELD_LINE_RE = /^  - ([a-z_]+):\s*(.+)$/;

type ParsedTask = {
  checked: boolean;
  title: string;
  metadata: Record<string, string>;
};

type CanonicalBoardTask = {
  title: string;
  checked: boolean;
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
};

type CanonicalBoardPayload = {
  tasks?: CanonicalBoardTask[];
};

function parseTaskBlocks(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const body = content.includes("\n---")
    ? content.slice(content.indexOf("\n---") + 4)
    : content;
  const lines = body.split("\n");
  let current: ParsedTask | null = null;

  for (const line of lines) {
    const taskMatch = line.match(TASK_LINE_RE);
    if (taskMatch) {
      if (current) {
        tasks.push(current);
      }
      current = {
        checked: taskMatch[1].toLowerCase() === "x",
        title: taskMatch[2].trim(),
        metadata: {},
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const fieldMatch = line.match(FIELD_LINE_RE);
    if (fieldMatch) {
      current.metadata[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }

  if (current) {
    tasks.push(current);
  }

  return tasks;
}

function readTaskFile(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function parseJsonPayload(text: string): CanonicalBoardPayload {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;
  return start >= 0 ? (JSON.parse(trimmed.slice(start)) as CanonicalBoardPayload) : {};
}

function toSnapshot(board: "inbox" | "backlog", task: ParsedTask, recordedAt: string): TaskSnapshot {
  const metadata = task.metadata;
  return {
    id: metadata.id ?? `${board}:${task.title}`,
    title: task.title,
    board,
    status: metadata.status ?? "inbox",
    owner: metadata.owner ?? "none",
    assigneeType: metadata.assignee_type ?? "none",
    assignee: metadata.assignee ?? "none",
    agentStatus: metadata.agent_status ?? "none",
    createdOn: metadata.created_on ?? "none",
    remindOn: metadata.remind_on ?? "none",
    runId: metadata.run_id ?? "none",
    flowId: metadata.flow_id ?? "none",
    detailsRef: metadata.details_ref ?? "none",
    resultsRef: metadata.results_ref ?? "none",
    logRef: metadata.log_ref ?? "none",
    checked: task.checked,
    recordedAt,
    rawJson: JSON.stringify({ board, ...task }, null, 2),
  };
}

function toCanonicalSnapshot(task: CanonicalBoardTask, recordedAt: string): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    board: task.status === "backlog" ? "backlog" : "inbox",
    status: task.status,
    owner: task.owner,
    assigneeType: task.assignee_type,
    assignee: task.assignee,
    agentStatus: task.agent_status,
    createdOn: task.created_on,
    remindOn: task.remind_on,
    runId: task.run_id,
    flowId: task.flow_id,
    detailsRef: task.details_ref,
    resultsRef: task.results_ref,
    logRef: task.log_ref,
    checked: task.checked,
    recordedAt,
    rawJson: JSON.stringify(task, null, 2),
  };
}

function collectCanonicalTaskSnapshots(tasksRoot: string, recordedAt: string): TaskSnapshot[] | null {
  if (path.resolve(tasksRoot) !== path.resolve(TASKS_ROOT)) {
    return null;
  }
  if (!existsSync(TASK_BOARD_WRAPPER)) {
    return null;
  }

  try {
    const childEnv = { ...process.env } as NodeJS.ProcessEnv;
    delete childEnv.OPENCLAW_HOME;
    const stdout = execFileSync("python3", [TASK_BOARD_WRAPPER, "export-board"], {
      cwd: OPENCLAW_HOME,
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });
    const payload = parseJsonPayload(stdout);
    if (!Array.isArray(payload.tasks)) {
      return null;
    }
    return payload.tasks.map((task) => toCanonicalSnapshot(task, recordedAt));
  } catch {
    return null;
  }
}

export function collectTaskSnapshots(tasksRoot: string, recordedAt: string): TaskSnapshot[] {
  const canonicalTasks = collectCanonicalTaskSnapshots(tasksRoot, recordedAt);
  if (canonicalTasks) {
    return canonicalTasks;
  }

  const boards = [
    { name: "inbox" as const, filePath: path.join(tasksRoot, "Task Inbox.md") },
    { name: "backlog" as const, filePath: path.join(tasksRoot, "Task Backlog.md") },
  ];

  return boards.flatMap(({ name, filePath }) => parseTaskBlocks(readTaskFile(filePath)).map((task) => toSnapshot(name, task, recordedAt)));
}
