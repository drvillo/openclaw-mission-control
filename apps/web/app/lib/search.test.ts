import { assert, test } from "vitest";
import type { MeetingRecording, MeetingReviewItem } from "./meetings";
import type { MyntItem, MyntPerson, MyntPersonRef } from "./mynt";
import { filterPersonForSearch, itemMatchesSearch, meetingMatchesSearch, personMatchesSearch } from "./search";

function personRef(partial: Partial<MyntPersonRef> = {}): MyntPersonRef {
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

function myntItem(partial: Partial<MyntItem> = {}): MyntItem {
  return {
    id: "item-1",
    kind: "action",
    assertionId: "assertion-1",
    reviewStatus: "accepted",
    person: personRef(),
    summary: "Prepare launch checklist",
    status: "todo",
    confidence: "high",
    score: 8,
    evidenceTimestamp: "00:04:12",
    meetingId: "meeting-1",
    meetingTitle: "Launch Planning",
    meetingDate: "2026-06-01",
    meetingParticipants: ["Alice Example", "Francesco Vivoli"],
    obsidianRef: "Meeting Recordings/Fathom/launch",
    playbackUrl: null,
    recordingId: "rec-1",
    taskId: "TASK-1",
    detailsRef: "details.md",
    dueDate: "2026-06-30",
    dueText: "end of June",
    associations: [{ identityId: "bob@example.com", displayName: "Bob Example", email: "bob@example.com" }],
    concept: { id: "concept-launch", label: "Launch readiness", summary: "Launch follow-up", status: "active", assignmentSource: "manual", confidence: null },
    archived: false,
    ...partial,
  };
}

function reviewItem(partial: Partial<MeetingReviewItem> = {}): MeetingReviewItem {
  return {
    id: "review-1",
    kind: "action",
    assertionId: "assertion-1",
    reviewStatus: "needs_review",
    label: "Action",
    status: "todo",
    owner: null,
    assignee: "Alice Example",
    confidence: "medium",
    score: 5,
    summary: "Send vendor evidence packet",
    evidence: "The vendor quote should be attached.",
    evidenceTargetTime: "00:05:00",
    evidenceTimestamps: ["00:05:00"],
    taskId: null,
    detailsRef: null,
    dueDate: null,
    dueText: null,
    associations: [],
    ...partial,
  };
}

test("item search covers assertions, meetings, people, associations, and concepts", () => {
  const item = myntItem();

  assert.equal(itemMatchesSearch(item, "launch checklist"), true);
  assert.equal(itemMatchesSearch(item, "alice@example.com"), true);
  assert.equal(itemMatchesSearch(item, "bob example"), true);
  assert.equal(itemMatchesSearch(item, "launch readiness"), true);
  assert.equal(itemMatchesSearch(item, "missing term"), false);
  assert.equal(itemMatchesSearch(item, ""), true);
});

test("meeting search includes participant and contained action or decision fields", () => {
  const meeting: MeetingRecording = {
    id: "meeting-1",
    title: "Weekly Planning",
    date: "2026-06-01",
    dateTime: "2026-06-01T10:00:00.000Z",
    month: "2026-06",
    participants: ["Francesco Vivoli", "Alice Example"],
    recordingId: "rec-1",
    playbackUrl: null,
    generatedAt: null,
    filePath: "/tmp/meeting.md",
    obsidianRef: "Meeting Recordings/Fathom/weekly",
    actions: [reviewItem()],
    decisions: [reviewItem({ kind: "decision", summary: "Choose the support vendor", evidence: "Vendor notes" })],
    actionCount: 1,
    decisionCount: 1,
  };

  assert.equal(meetingMatchesSearch(meeting, "Francesco"), true);
  assert.equal(meetingMatchesSearch(meeting, "vendor quote"), true);
  assert.equal(meetingMatchesSearch(meeting, "support vendor"), true);
  assert.equal(meetingMatchesSearch(meeting, "roadmap"), false);
});

test("person search filters lanes to matching visible assertions", () => {
  const launchAction = myntItem({ id: "launch-action", summary: "Prepare launch checklist" });
  const budgetDecision = myntItem({ id: "budget-decision", kind: "decision", summary: "Approve budget", status: null });
  const person: MyntPerson = {
    ...personRef(),
    actionCount: 1,
    decisionCount: 1,
    totalCount: 2,
    actions: [launchAction],
    decisions: [budgetDecision],
  };

  assert.equal(personMatchesSearch(person, "budget"), true);
  const filtered = filterPersonForSearch(person, "budget");
  assert.equal(filtered?.actionCount, 0);
  assert.equal(filtered?.decisionCount, 1);
  assert.equal(filtered?.decisions[0].id, "budget-decision");
  assert.equal(filterPersonForSearch(person, "nobody"), null);
});
