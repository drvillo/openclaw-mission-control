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
});
