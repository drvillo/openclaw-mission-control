import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TaskSnapshot } from "@ocmc/shared";

const TASK_LINE_RE = /^- \[([ xX])\] (.+)$/;
const FIELD_LINE_RE = /^  - ([a-z_]+):\s*(.+)$/;

type ParsedTask = {
  checked: boolean;
  title: string;
  metadata: Record<string, string>;
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

export function collectTaskSnapshots(tasksRoot: string, recordedAt: string): TaskSnapshot[] {
  const boards = [
    { name: "inbox" as const, filePath: path.join(tasksRoot, "Task Inbox.md") },
    { name: "backlog" as const, filePath: path.join(tasksRoot, "Task Backlog.md") },
  ];

  return boards.flatMap(({ name, filePath }) => parseTaskBlocks(readTaskFile(filePath)).map((task) => toSnapshot(name, task, recordedAt)));
}
