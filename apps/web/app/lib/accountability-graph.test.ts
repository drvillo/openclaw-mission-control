import { assert, test } from "vitest";
import { buildAccountabilityGraph, deriveAccountabilityConceptSummaries } from "./accountability-graph";
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
  assert.equal(graph.stats.concepts, 0);
  assert.ok(graph.nodes.some((node) => node.id === "person:identity:alice@example.com"));
  assert.ok(graph.nodes.some((node) => node.id === "person:identity:bob@example.com"));
  assert.ok(!graph.nodes.some((node) => node.id === "person:identity:francesco@lunarrails.io"));
  assert.ok(graph.links.some((link) => link.type === "assigned_action"));
  assert.ok(graph.links.some((link) => link.type === "owns_decision"));
  assert.ok(graph.links.some((link) => link.type === "participant_context"));
  assert.ok(graph.links.some((link) => link.type === "same_meeting"));
});

test("buildAccountabilityGraph exposes concept metadata on assigned assertions", () => {
  const graph = buildAccountabilityGraph(
    [
      item({
        id: "action-1",
        kind: "action",
        summary: "Send launch notes",
        concept: { id: "concept-launch", label: "Launch readiness", summary: "Launch follow-up", status: "active", assignmentSource: "manual", confidence: null },
      }),
    ],
    { identities },
  );

  const assertion = graph.nodes.find((node) => node.nodeType === "assertion");
  assert.equal(assertion?.nodeType === "assertion" ? assertion.concept?.label : null, "Launch readiness");
  assert.ok(graph.nodes.some((node) => node.nodeType === "concept" && node.label === "Launch readiness"));
  assert.ok(graph.links.some((link) => link.type === "semantic_group" && link.label === "Semantic group"));
  assert.equal(graph.stats.concepts, 1);
});

test("buildAccountabilityGraph creates semantic group nodes with source and confidence stats", () => {
  const concept = { id: "concept-autopilot", label: "Semantic autopilot", summary: "Autopilot follow-up", status: "active" as const, assignmentSource: "semantic_auto" as const, confidence: 0.92 };
  const graph = buildAccountabilityGraph(
    [
      item({ id: "action-1", kind: "action", summary: "Tune autopilot", concept }),
      item({ id: "decision-1", kind: "decision", summary: "Use autopilot", concept, reviewStatus: "accepted", meetingId: "meeting-2", meetingTitle: "Autopilot Review", meetingDate: "2026-06-07" }),
    ],
    { identities },
  );

  const group = graph.nodes.find((node) => node.nodeType === "concept" && node.conceptId === "concept-autopilot");
  if (!group || group.nodeType !== "concept") throw new Error("expected semantic concept node");
  assert.equal(group.assertionCount, 2);
  assert.deepEqual(group.assignmentSources, ["semantic_auto"]);
  assert.equal(group.averageConfidence, 0.92);
  assert.equal(graph.links.filter((link) => link.type === "semantic_group").length, 2);
});

test("deriveAccountabilityConceptSummaries keeps landscape and attention over the same concept IDs", () => {
  const concept = { id: "concept-agency", label: "Investigation agency", summary: "Agency follow-up", status: "active" as const, assignmentSource: "auto" as const, confidence: 0.8 };
  const items = [
    item({ id: "agency-action", kind: "action", summary: "Coordinate agency", concept, status: "todo" }),
    item({ id: "agency-decision", kind: "decision", summary: "Pick agency", concept, reviewStatus: "accepted", meetingId: "meeting-2", meetingTitle: "Follow-up", meetingDate: "2026-06-08" }),
  ];

  const summaries = deriveAccountabilityConceptSummaries(items);
  assert.deepEqual(summaries.map((summary) => summary.conceptId), ["concept-agency"]);
  assert.equal(summaries[0].actionCount, 1);
  assert.equal(summaries[0].decisionCount, 1);
  assert.equal(summaries[0].pendingReviewCount, 1);
  assert.equal(summaries[0].assignedItems.length, 2);
  assert.equal(summaries[0].representativeItems.length, 2);
  assert.equal(summaries[0].recentMeetings.length, 2);
  assert.deepEqual(summaries[0].assignmentSources, ["auto"]);
  assert.equal(summaries[0].primarySource, "auto");
  assert.equal(summaries[0].averageConfidence, 0.8);
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
