import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AssertionRegister } from "./assertion-register";
import type { MyntIndex, MyntItem } from "../lib/mynt";

function item(partial: Partial<MyntItem> & Pick<MyntItem, "id" | "kind" | "reviewStatus" | "summary">): MyntItem {
  return {
    assertionId: `assertion-${partial.id}`,
    person: {
      id: "identity:alice@example.com",
      displayName: "Alice Example",
      email: "alice@example.com",
      raw: "Alice Example",
      isSelf: false,
      identityId: "alice@example.com",
      resolved: true,
    },
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

function index(): MyntIndex {
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
    items: [
      item({ id: "pending-action", kind: "action", reviewStatus: "needs_review", summary: "Review launch" }),
      item({ id: "next-action", kind: "action", reviewStatus: "accepted", summary: "Prepare follow-up", status: "next" }),
      item({ id: "done-action", kind: "action", reviewStatus: "accepted", summary: "Finished launch", status: "done" }),
      item({ id: "pending-decision", kind: "decision", reviewStatus: "needs_review", summary: "Choose vendor" }),
    ],
    archivedCount: 0,
    identities: [
      {
        id: "alice@example.com",
        email: "alice@example.com",
        displayName: "Alice Example",
        aliases: ["Alice Example"],
        actionCount: 3,
        decisionCount: 1,
        totalCount: 4,
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

describe("AssertionRegister action completion", () => {
  test("action rows render per-row mark-done controls for non-done actions", () => {
    render(<AssertionRegister index={index()} kind="action" statusFilter="all" />);

    expect(screen.getAllByRole("button", { name: "Mark as done" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Mark selected done" })).toBeDisabled();
  });

  test("selected action rows post mark_action_done", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, summary: "Marked action done.", payload: { updated: 1, status: "done" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssertionRegister index={index()} kind="action" statusFilter="all" />);
    fireEvent.click(screen.getByLabelText("Select Review launch"));
    fireEvent.click(screen.getByLabelText("Select Prepare follow-up"));
    fireEvent.click(screen.getByRole("button", { name: "Mark selected done" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(bodies).toEqual([
      { operation: "mark_action_done", assertionId: "assertion-pending-action" },
      { operation: "mark_action_done", assertionId: "assertion-next-action" },
    ]);
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Mark as done" })).toHaveLength(0));
  });

  test("decision registers do not render mark-done controls", () => {
    render(<AssertionRegister index={index()} kind="decision" statusFilter="all" />);

    expect(screen.queryByRole("button", { name: "Mark selected done" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument();
  });
});
