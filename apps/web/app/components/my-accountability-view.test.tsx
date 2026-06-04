import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MyAccountabilityView } from "./my-accountability-view";
import type { MyntIndex, MyntItem } from "../lib/mynt";

function person(isSelf = true) {
  return {
    id: isSelf ? "identity:francesco@lunarrails.io" : "identity:alice@example.com",
    displayName: isSelf ? "Francesco Vivoli" : "Alice Example",
    email: isSelf ? "francesco@lunarrails.io" : "alice@example.com",
    raw: isSelf ? "Francesco Vivoli" : "Alice Example",
    isSelf,
    identityId: isSelf ? "francesco@lunarrails.io" : "alice@example.com",
    resolved: true,
  };
}

function item(partial: Partial<MyntItem> & Pick<MyntItem, "id" | "kind" | "reviewStatus" | "summary">): MyntItem {
  return {
    assertionId: `assertion-${partial.id}`,
    person: person(true),
    status: partial.kind === "action" ? "todo" : null,
    confidence: "high",
    score: 7,
    evidenceTimestamp: "00:01:00",
    meetingId: "meeting-1",
    meetingTitle: "Planning",
    meetingDate: "2026-06-01",
    meetingParticipants: ["Francesco Vivoli", "Alice Example"],
    obsidianRef: "Meeting Recordings/Fathom/planning",
    playbackUrl: null,
    recordingId: "recording-1",
    taskId: null,
    detailsRef: null,
    dueDate: null,
    dueText: null,
    archived: false,
    ...partial,
  };
}

function index(): MyntIndex {
  const items = [
    item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review the launch action" }),
    item({ id: "todo-action", kind: "action", reviewStatus: "accepted", summary: "Accepted todo action", status: "todo" }),
    item({ id: "next-action", kind: "action", reviewStatus: "accepted", summary: "Accepted next action", status: "next" }),
    item({ id: "doing-action", kind: "action", reviewStatus: "accepted", summary: "Accepted doing action", status: "in_progress" }),
    item({ id: "done-action", kind: "action", reviewStatus: "accepted", summary: "Accepted done action", status: "done" }),
    item({ id: "pending-decision", kind: "decision", reviewStatus: "needs_review", summary: "Pending decision" }),
    item({ id: "accepted-decision", kind: "decision", reviewStatus: "accepted", summary: "Accepted decision" }),
  ];
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
        id: "francesco@lunarrails.io",
        email: "francesco@lunarrails.io",
        displayName: "Francesco Vivoli",
        aliases: ["Francesco Vivoli", "francesco@lunarrails.io"],
        isSelf: true,
        actionCount: 5,
        decisionCount: 2,
        totalCount: 7,
      },
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

describe("MyAccountabilityView", () => {
  test("renders action inbox, action columns, decision inbox, and decision log", () => {
    render(<MyAccountabilityView index={index()} />);

    expect(screen.getByRole("heading", { name: "Review inbox" })).toBeInTheDocument();
    for (const name of ["To do", "Next", "In Progress", "Done"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Review the launch action")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Decisions/u }));

    expect(screen.getByRole("heading", { name: "Review inbox" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision log" })).toBeInTheDocument();
    expect(screen.getByText("Pending decision")).toBeInTheDocument();
    expect(screen.getByText("Accepted decision")).toBeInTheDocument();
  });

  test("pending action Mark as done posts mark_action_done", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, summary: "Marked action done.", payload: { updated: 1, status: "done" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MyAccountabilityView index={index()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark as done" })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "mark_action_done",
      assertionId: "assertion-pending-action",
    });
  });

  test("decisions do not render reassign, mark-done, or action status controls", () => {
    render(<MyAccountabilityView index={index()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Decisions/u }));

    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Action status")).not.toBeInTheDocument();
  });
});
