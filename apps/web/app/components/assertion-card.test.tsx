import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AssertionCard } from "./assertion-card";
import type { MyntItem } from "../lib/mynt";

function item(partial: Partial<MyntItem> = {}): MyntItem {
  return {
    id: "action-1",
    kind: "action",
    assertionId: "assertion-action-1",
    reviewStatus: "needs_review",
    person: {
      id: "identity:alice@example.com",
      displayName: "Alice Example",
      email: "alice@example.com",
      raw: "Alice Example",
      isSelf: false,
      identityId: "alice@example.com",
      resolved: true,
    },
    summary: "Alice follows up",
    status: "todo",
    confidence: "high",
    score: 7,
    evidenceTimestamp: "00:01:00",
    meetingId: "meeting-1",
    meetingTitle: "Planning",
    meetingDate: "2026-06-01",
    meetingParticipants: ["Alice Example", "Bob Example"],
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

describe("AssertionCard associations", () => {
  test("does not render an association trigger for empty associations", () => {
    render(<AssertionCard item={item()} pending={false} assigneeIdentities={[]} />);

    expect(screen.queryByLabelText(/associated people/u)).not.toBeInTheDocument();
  });

  test("renders associated people without provenance", () => {
    render(
      <AssertionCard
        item={item({
          associations: [{ identityId: "bob@example.com", displayName: "Bob Example", email: "bob@example.com" }],
        })}
        pending={false}
        assigneeIdentities={[]}
      />,
    );

    expect(screen.getByLabelText("1 associated person")).toBeInTheDocument();
    expect(screen.getByText("Bob Example")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/evidence_speaker|two_person_other_participant/u)).not.toBeInTheDocument();
  });
});
