import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TasksBoard } from "./tasks-board";

type BoardTask = Parameters<typeof TasksBoard>[0]["tasks"][number];

function task(id: string, status: string): BoardTask {
  return {
    id,
    status,
    title: `${id} title`,
    checked: status === "done",
    line: 1,
    owner: "ops",
    assignee_type: "human",
    assignee: "Francesco",
    agent_status: "none",
    created_on: "2026-06-01",
    remind_on: "none",
    run_id: "none",
    flow_id: "none",
    details_ref: "none",
    results_ref: "none",
    log_ref: "none",
    detail_path: null,
    detail_exists: false,
    detail_sections: {
      request: "",
      acceptance_criteria: "",
      execution_log: "",
      results: "",
    },
    detail_triage: {
      owner: null,
      next_action: null,
      blocked_on: null,
      decision_by: null,
    },
    detail_body: null,
    lint_errors: [],
    lint_warnings: [],
  };
}

describe("TasksBoard", () => {
  test("renders the five My Work columns", () => {
    render(<TasksBoard tasks={[task("task-1", "next")]} />);

    for (const name of ["Backlog", "Inbox", "Next", "Waiting", "Done"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  test("renders actionable task deep links when provided", () => {
    render(
      <TasksBoard
        tasks={[task("task-20260608-001", "next")]}
        taskLinksById={{
          "task-20260608-001": { href: "/ops/day/2026-06-08", label: "Open packet day" },
        }}
        selectedTaskId="task-20260608-001"
      />,
    );

    expect(screen.getAllByRole("link", { name: "Open packet day" })[0]).toHaveAttribute("href", "/ops/day/2026-06-08");
  });

  test("opens the raw detail note by default in the selected task modal", () => {
    const selected = {
      ...task("task-20260608-010", "done"),
      detail_exists: true,
      detail_sections: {
        request: "Plan the bridge",
        acceptance_criteria: "Show the note",
        execution_log: "",
        results: "Selected architecture",
      },
      detail_body: "# Plan Mission Control to OpenClaw runtime bridge\n\n## Results\nSelected architecture",
    } satisfies BoardTask;

    render(<TasksBoard tasks={[selected]} selectedTaskId="task-20260608-010" />);

    const rawDetail = screen.getByText("Raw detail note and references").closest("details");
    expect(rawDetail).toHaveAttribute("open");
    expect(screen.getByText(/# Plan Mission Control to OpenClaw runtime bridge/)).toBeInTheDocument();
  });
});
