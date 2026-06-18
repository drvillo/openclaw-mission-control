import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./accountability-graph-canvas", () => ({
  AccountabilityGraphCanvas: ({
    graph,
    onNodeSelect,
    onBackgroundClick,
  }: {
    graph: { nodes: Array<{ id?: string; nodeType: string; role?: string; displayName?: string; kind?: string; summary?: string }> };
    onNodeSelect: (node: unknown, anchor: { nodeId: string; x: number; y: number; visible: boolean; viewportWidth: number; viewportHeight: number } | null) => void;
    onBackgroundClick: () => void;
  }) => {
    const ownerNode = graph.nodes.find((node) => node.nodeType === "person" && node.role === "owner");
    const participantNode = graph.nodes.find((node) => node.nodeType === "person" && node.role === "participant");
    const assertionNode = graph.nodes.find((node) => node.nodeType === "assertion");
    const actionCount = graph.nodes.filter((node) => node.nodeType === "assertion" && node.kind === "action").length;
    const decisionCount = graph.nodes.filter((node) => node.nodeType === "assertion" && node.kind === "decision").length;
    const anchorFor = (node: { id?: string } | undefined) =>
      node
        ? { nodeId: String(node.id ?? "node"), x: 320, y: 200, visible: true, viewportWidth: 1280, viewportHeight: 900 }
        : null;
    return (
      <div>
        <div>Mock graph assertions {actionCount + decisionCount}</div>
        <div>Mock graph actions {actionCount}</div>
        <div>Mock graph decisions {decisionCount}</div>
        <button type="button" onClick={() => ownerNode && onNodeSelect(ownerNode, anchorFor(ownerNode))}>
          Mock graph canvas {graph.nodes.length}
        </button>
        <button type="button" onClick={() => participantNode && onNodeSelect(participantNode, anchorFor(participantNode))}>
          Select participant {participantNode?.displayName ?? "node"}
        </button>
        <button type="button" onClick={() => assertionNode && onNodeSelect(assertionNode, anchorFor(assertionNode))}>
          Select assertion {assertionNode?.summary ?? "node"}
        </button>
        <button type="button" onClick={onBackgroundClick}>
          Clear graph selection
        </button>
      </div>
    );
  },
}));

import { MyntView } from "./mynt-view";
import type { MyntIndex, MyntItem, MyntPersonRef } from "../lib/mynt";

function person(partial: Partial<MyntPersonRef> = {}): MyntPersonRef {
  return {
    id: "identity:alice@example.com",
    displayName: "Alice Example",
    email: "alice@example.com",
    raw: "Alice Example",
    isSelf: false,
    identityId: "alice@example.com",
    resolved: true,
    ...partial,
  };
}

function item(partial: Partial<MyntItem> & Pick<MyntItem, "id" | "kind" | "reviewStatus" | "summary">): MyntItem {
  return {
    assertionId: `assertion-${partial.id}`,
    person: person(),
    status: partial.kind === "action" ? "todo" : null,
    confidence: "high",
    score: 7,
    evidenceTimestamp: "00:01:00",
    meetingId: "meeting-1",
    meetingTitle: "Planning",
    meetingDate: "2026-06-01",
    meetingParticipants: ["Alice Example", "Francesco Vivoli"],
    obsidianRef: "Meeting Recordings/Fathom/planning",
    playbackUrl: null,
    recordingId: "recording-1",
    taskId: null,
    detailsRef: null,
    dueDate: null,
    dueText: null,
    associations: [],
    archived: false,
    ...partial,
  };
}

function index(items: MyntItem[]): MyntIndex {
  return {
    statePath: "/tmp/mynt-identities.json",
    state: {
      version: 1,
      showSelfDefault: false,
      archivedItemIds: [],
      identities: [],
    },
    people: [],
    peopleWithSelf: [],
    hiddenSelfCount: 0,
    items,
    archivedCount: 0,
    identities: [
      {
        id: "alice@example.com",
        email: "alice@example.com",
        displayName: "Alice Example",
        aliases: ["Alice Example"],
        actionCount: 0,
        decisionCount: 0,
        totalCount: 0,
      },
    ],
    duplicates: [],
    archivePreview: {
      cutoffDate: "2026-05-01",
      peopleAffected: 0,
      itemIds: [],
      itemCount: 0,
      linkedTaskIds: [],
      linkedTaskCount: 0,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MyntView action completion", () => {
  test("renders the list view by default and toggles to the graph view", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));

    expect(screen.getByRole("dialog", { name: "3D Accountability Graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mock graph canvas/u })).toBeInTheDocument();
  });

  test("selecting a graph person shows the existing action operations", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Mock graph canvas/u }));

    expect(screen.getByRole("heading", { name: "Alice Example" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as done" })).toBeInTheDocument();
  });

  test("selecting a graph person renders all related actions and decisions", () => {
    render(
      <MyntView
        index={index([
          item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" }),
          item({ id: "next-action", kind: "action", reviewStatus: "accepted", summary: "Prepare follow-up", status: "next" }),
          item({ id: "decision-one", kind: "decision", reviewStatus: "needs_review", summary: "Choose vendor" }),
          item({ id: "decision-two", kind: "decision", reviewStatus: "accepted", summary: "Lock timeline" }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Mock graph canvas/u }));

    expect(screen.getByRole("tab", { name: /Actions2/u })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Review launch")).toBeInTheDocument();
    expect(screen.getByText("Prepare follow-up")).toBeInTheDocument();
    expect(screen.queryByText("Choose vendor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Decisions2/u }));

    expect(screen.getByRole("tab", { name: /Decisions2/u })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Choose vendor")).toBeInTheDocument();
    expect(screen.getByText("Lock timeline")).toBeInTheDocument();
    expect(screen.queryByText("Review launch")).not.toBeInTheDocument();
  });

  test("selecting a second node replaces the previous overlay content", () => {
    render(
      <MyntView
        index={index([
          item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" }),
          item({ id: "pending-decision", kind: "decision", reviewStatus: "needs_review", summary: "Choose vendor" }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Mock graph canvas/u }));
    expect(screen.getByRole("heading", { name: "Alice Example" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Select assertion Review launch/u }));

    expect(screen.getByRole("heading", { name: "Review launch" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alice Example" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Selected graph details")).toHaveLength(1);
  });

  test("selecting a graph assertion shows assertion details and operations", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Select assertion Review launch/u }));

    expect(screen.getByRole("heading", { name: "Review launch" })).toBeInTheDocument();
    expect(screen.getByText("Connected People")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as done" })).toBeInTheDocument();
  });

  test("graph hides done actions by default and all actions makes them visible", () => {
    render(
      <MyntView
        index={index([
          item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" }),
          item({ id: "done-action", kind: "action", reviewStatus: "accepted", summary: "Finished launch", status: "done" }),
          item({ id: "pending-decision", kind: "decision", reviewStatus: "needs_review", summary: "Choose vendor" }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));

    expect(screen.getByText("Mock graph actions 1")).toBeInTheDocument();
    expect(screen.getByText("Mock graph decisions 1")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("All actions"));

    expect(screen.getByText("Mock graph actions 2")).toBeInTheDocument();
  });

  test("graph legend toggles action and decision assertion types independently", () => {
    render(
      <MyntView
        index={index([
          item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" }),
          item({ id: "pending-decision", kind: "decision", reviewStatus: "needs_review", summary: "Choose vendor" }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: "Action" }));

    expect(screen.getByText("Mock graph actions 0")).toBeInTheDocument();
    expect(screen.getByText("Mock graph decisions 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Decision" }));

    expect(screen.getByText("Mock graph assertions 0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    fireEvent.click(screen.getByRole("button", { name: "Decision" }));

    expect(screen.getByText("Mock graph actions 1")).toBeInTheDocument();
    expect(screen.getByText("Mock graph decisions 1")).toBeInTheDocument();
  });

  test("pending-review graph selections do not show accepted related participant items", () => {
    render(
      <MyntView
        pendingReviewOnly
        index={index([
          item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Pending launch", meetingParticipants: ["Bob Example"] }),
          item({ id: "accepted-action", kind: "action", reviewStatus: "accepted", summary: "Accepted launch", meetingParticipants: ["Bob Example"] }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Select participant/u }));

    expect(screen.getByText("Pending launch")).toBeInTheDocument();
    expect(screen.queryByText("Accepted launch")).not.toBeInTheDocument();
  });

  test("background click and explicit close dismiss the selected overlay", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    fireEvent.click(screen.getByRole("button", { name: /Mock graph canvas/u }));
    expect(screen.getByRole("heading", { name: "Alice Example" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByLabelText("Selected graph details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mock graph canvas/u }));
    expect(screen.getByRole("heading", { name: "Alice Example" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear graph selection" }));
    expect(screen.queryByLabelText("Selected graph details")).not.toBeInTheDocument();
  });

  test("Escape closes the fullscreen graph overlay", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accountability Graph" }));
    expect(screen.getByRole("dialog", { name: "3D Accountability Graph" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "3D Accountability Graph" })).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  test("expanded non-self action card renders Mark as done when action is not done", () => {
    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
        expandedPersonId="identity:alice@example.com"
      />,
    );

    expect(screen.getByRole("button", { name: "Mark as done" })).toBeInTheDocument();
  });

  test("clicking Mark as done posts mark_action_done and updates the card", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, summary: "Marked action done.", payload: { updated: 1, status: "done" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MyntView
        index={index([item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" })])}
        expandedPersonId="identity:alice@example.com"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      operation: "mark_action_done",
      assertionId: "assertion-pending-action",
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument());
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  test("done action cards do not render Mark as done", () => {
    render(
      <MyntView
        index={index([item({ id: "done-action", kind: "action", reviewStatus: "accepted", summary: "Finished launch", status: "done" })])}
        expandedPersonId="identity:alice@example.com"
      />,
    );

    expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument();
  });
});
