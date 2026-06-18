import { assert, test } from "vitest";
import { buildAccountabilityGraph } from "./accountability-graph";
import type { MyntIndex, MyntItem, MyntPersonRef } from "./mynt";

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

function item(partial: Partial<MyntItem> & Pick<MyntItem, "id" | "kind" | "summary">): MyntItem {
  return {
    assertionId: `assertion-${partial.id}`,
    reviewStatus: "needs_review",
    person: person(),
    status: partial.kind === "action" ? "todo" : null,
    confidence: "high",
    score: 7,
    evidenceTimestamp: "00:01:00",
    meetingId: "meeting-1",
    meetingTitle: "Planning",
    meetingDate: "2026-06-01",
    meetingParticipants: ["Alice Example", "Bob Example", "Francesco Vivoli"],
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

const identities: MyntIndex["identities"] = [
  {
    id: "alice@example.com",
    email: "alice@example.com",
    displayName: "Alice Example",
    aliases: ["Alice Example"],
    actionCount: 0,
    decisionCount: 0,
    totalCount: 0,
  },
  {
    id: "bob@example.com",
    email: "bob@example.com",
    displayName: "Bob Example",
    aliases: ["Bob Example"],
    actionCount: 0,
    decisionCount: 0,
    totalCount: 0,
  },
  {
    id: "francesco@lunarrails.io",
    email: "francesco@lunarrails.io",
    displayName: "Francesco Vivoli",
    aliases: ["Francesco Vivoli"],
    isSelf: true,
    actionCount: 0,
    decisionCount: 0,
    totalCount: 0,
  },
];

test("buildAccountabilityGraph creates person, assertion, participant, and ownership links", () => {
  const graph = buildAccountabilityGraph(
    [
      item({ id: "action-1", kind: "action", summary: "Send launch notes" }),
      item({ id: "decision-1", kind: "decision", summary: "Use phased launch", reviewStatus: "accepted" }),
    ],
    { identities },
  );

  assert.equal(graph.stats.people, 2);
  assert.equal(graph.stats.assertions, 2);
  assert.equal(graph.stats.actions, 1);
  assert.equal(graph.stats.decisions, 1);
  assert.equal(graph.stats.pending, 1);
  assert.ok(graph.nodes.some((node) => node.id === "person:identity:alice@example.com"));
  assert.ok(graph.nodes.some((node) => node.id === "person:identity:bob@example.com"));
  assert.ok(!graph.nodes.some((node) => node.id === "person:identity:francesco@lunarrails.io"));
  assert.ok(graph.links.some((link) => link.type === "assigned_action"));
  assert.ok(graph.links.some((link) => link.type === "owns_decision"));
  assert.ok(graph.links.some((link) => link.type === "participant_context"));
  assert.ok(graph.links.some((link) => link.type === "same_meeting"));
});

test("buildAccountabilityGraph excludes archived, self-owned, and accepted items when requested", () => {
  const graph = buildAccountabilityGraph(
    [
      item({ id: "archived-action", kind: "action", summary: "Old action", archived: true }),
      item({ id: "accepted-action", kind: "action", summary: "Accepted action", reviewStatus: "accepted" }),
      item({ id: "self-action", kind: "action", summary: "Self action", person: person({ id: "identity:francesco@lunarrails.io", displayName: "Francesco Vivoli", email: "francesco@lunarrails.io", isSelf: true, identityId: "francesco@lunarrails.io" }) }),
      item({ id: "pending-action", kind: "action", summary: "Pending action" }),
    ],
    { identities, pendingReviewOnly: true },
  );

  const assertionIds = graph.nodes.filter((node) => node.nodeType === "assertion").map((node) => node.itemId);
  assert.deepEqual(assertionIds, ["pending-action"]);
});

test("buildAccountabilityGraph creates associated identity links and excludes self associations by default", () => {
  const graph = buildAccountabilityGraph(
    [
      item({
        id: "action-1",
        kind: "action",
        summary: "Coordinate with Bob",
        associations: [
          { identityId: "bob@example.com", displayName: "Bob Example", email: "bob@example.com" },
          { identityId: "francesco@lunarrails.io", displayName: "Francesco Vivoli", email: "francesco@lunarrails.io" },
        ],
      }),
    ],
    { identities },
  );

  const associationLinks = graph.links.filter((link) => link.type === "associated_identity");
  assert.equal(associationLinks.length, 1);
  assert.equal(associationLinks[0].pendingCount, 1);
  assert.ok(graph.nodes.some((node) => node.id === "person:identity:bob@example.com"));
  assert.ok(!graph.nodes.some((node) => node.id === "person:identity:francesco@lunarrails.io"));
});

test("buildAccountabilityGraph can include self associations when the current filter includes self", () => {
  const graph = buildAccountabilityGraph(
    [
      item({
        id: "action-1",
        kind: "action",
        summary: "Coordinate with Francesco",
        associations: [{ identityId: "francesco@lunarrails.io", displayName: "Francesco Vivoli", email: "francesco@lunarrails.io" }],
      }),
    ],
    { identities, includeSelf: true },
  );

  assert.ok(graph.nodes.some((node) => node.id === "person:identity:francesco@lunarrails.io"));
});

test("buildAccountabilityGraph counts pending state across both ends of same-meeting links", () => {
  const graph = buildAccountabilityGraph(
    [
      item({ id: "accepted-decision", kind: "decision", summary: "Use phased launch", reviewStatus: "accepted" }),
      item({ id: "pending-action", kind: "action", summary: "Send launch notes", reviewStatus: "needs_review" }),
    ],
    { identities },
  );

  const sameMeetingLink = graph.links.find((link) => link.type === "same_meeting");
  assert.equal(sameMeetingLink?.pendingCount, 1);
  assert.deepEqual(sameMeetingLink?.itemIds.sort(), ["accepted-decision", "pending-action"]);
});
