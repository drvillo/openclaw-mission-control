import type { MyntIdentity, MyntIndex, MyntItem, MyntPersonRef } from "./mynt";

export type AccountabilityGraphPersonNode = {
  id: string;
  nodeType: "person";
  label: string;
  displayName: string;
  email: string | null;
  personId: string;
  identityId: string | null;
  resolved: boolean;
  isSelf: boolean;
  role: "owner" | "associated" | "participant";
  actionCount: number;
  decisionCount: number;
  pendingCount: number;
  itemIds: string[];
};

export type AccountabilityGraphAssertionNode = {
  id: string;
  nodeType: "assertion";
  label: string;
  assertionId: string | null;
  itemId: string;
  kind: "action" | "decision";
  summary: string;
  reviewStatus: MyntItem["reviewStatus"];
  status: string | null;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  ownerPersonId: string;
  concept?: {
    id: string;
    label: string;
    summary?: string | null;
    assignmentSource?: string;
    confidence?: number | null;
  } | null;
};

export type AccountabilityGraphConceptNode = {
  id: string;
  nodeType: "concept";
  label: string;
  conceptId: string;
  summary: string;
  assertionCount: number;
  actionCount: number;
  decisionCount: number;
  pendingReviewCount: number;
  people: string[];
  recentMeetings: Array<{ meetingId: string; title: string; date: string }>;
  assignmentSources: string[];
  averageConfidence: number | null;
};

export type AccountabilityGraphNode = AccountabilityGraphPersonNode | AccountabilityGraphAssertionNode | AccountabilityGraphConceptNode;

export type AccountabilityGraphLinkType = "assigned_action" | "owns_decision" | "associated_identity" | "participant_context" | "same_meeting" | "semantic_group";

export type AccountabilityGraphLink = {
  id: string;
  source: string;
  target: string;
  type: AccountabilityGraphLinkType;
  label: string;
  weight: number;
  itemIds: string[];
  meetingIds: string[];
  pendingCount: number;
};

export type AccountabilityGraph = {
  nodes: AccountabilityGraphNode[];
  links: AccountabilityGraphLink[];
  stats: {
    people: number;
    assertions: number;
    actions: number;
    decisions: number;
    pending: number;
    concepts: number;
  };
};

export type AccountabilityConceptSummary = {
  conceptId: string;
  label: string;
  summary: string;
  actionCount: number;
  decisionCount: number;
  assertionCount: number;
  involvedPeople: string[];
  recentMeetings: Array<{ meetingId: string; title: string; date: string }>;
  openActions: number;
  pendingReviewCount: number;
  assignedItems: MyntItem[];
  representativeItems: MyntItem[];
  fragmentedOwnerCount: number;
  landscapeRank: number;
  attentionRank: number;
  assignmentSources: string[];
  primarySource: string;
  averageConfidence: number | null;
};

type GraphIdentity = Pick<MyntIdentity, "id" | "email" | "displayName" | "aliases" | "isSelf">;

type BuildAccountabilityGraphOptions = {
  identities: MyntIndex["identities"] | GraphIdentity[];
  includeSelf?: boolean;
  pendingReviewOnly?: boolean;
};

function normalizeActor(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function actorKey(value: string) {
  return normalizeActor(value).toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function personNodeId(personId: string) {
  return `person:${personId}`;
}

function assertionNodeId(item: MyntItem) {
  return `assertion:${item.assertionId || item.id}`;
}

function conceptNodeId(conceptId: string) {
  return `concept:${conceptId}`;
}

function identityPersonId(identityId: string) {
  return `identity:${identityId}`;
}

function rawPersonId(raw: string) {
  return `raw:${actorKey(raw)}`;
}

function identityMatches(identity: GraphIdentity, key: string) {
  return (
    actorKey(identity.displayName) === key ||
    actorKey(identity.email) === key ||
    identity.aliases.some((alias) => actorKey(alias) === key)
  );
}

function personRefFromRaw(raw: string, identities: GraphIdentity[]): MyntPersonRef {
  const normalized = normalizeActor(raw);
  const key = actorKey(normalized);
  const identity = identities.find((candidate) => identityMatches(candidate, key));
  if (identity) {
    return {
      id: identityPersonId(identity.id),
      displayName: identity.displayName,
      email: identity.email || null,
      raw: normalized,
      isSelf: Boolean(identity.isSelf),
      identityId: identity.id,
      resolved: true,
    };
  }
  return {
    id: rawPersonId(normalized),
    displayName: normalized,
    email: null,
    raw: normalized,
    isSelf: false,
    identityId: null,
    resolved: false,
  };
}

function personRefFromAssociation(association: MyntItem["associations"][number], identities: GraphIdentity[]): MyntPersonRef {
  const identity = identities.find((candidate) => candidate.id === association.identityId);
  return {
    id: identityPersonId(association.identityId),
    displayName: identity?.displayName || association.displayName,
    email: identity?.email || association.email,
    raw: association.displayName,
    isSelf: Boolean(identity?.isSelf),
    identityId: association.identityId,
    resolved: true,
  };
}

function shouldIncludeItem(item: MyntItem, options: BuildAccountabilityGraphOptions) {
  if (item.archived) {
    return false;
  }
  if (!options.includeSelf && item.person.isSelf) {
    return false;
  }
  if (options.pendingReviewOnly && item.reviewStatus !== "needs_review") {
    return false;
  }
  return true;
}

function upsertPersonNode(
  nodes: Map<string, AccountabilityGraphNode>,
  person: MyntPersonRef,
  role: AccountabilityGraphPersonNode["role"],
  item?: MyntItem,
) {
  const id = personNodeId(person.id);
  const current = nodes.get(id);
  if (current?.nodeType === "person") {
    current.role = current.role === "owner" || role !== "owner" ? current.role : role;
    if (item) {
      current.itemIds = unique([...current.itemIds, item.id]);
      if (role === "owner") {
        current.actionCount += item.kind === "action" ? 1 : 0;
        current.decisionCount += item.kind === "decision" ? 1 : 0;
        current.pendingCount += item.reviewStatus === "needs_review" ? 1 : 0;
      }
    }
    return current;
  }

  const node: AccountabilityGraphPersonNode = {
    id,
    nodeType: "person",
    label: person.displayName,
    displayName: person.displayName,
    email: person.email,
    personId: person.id,
    identityId: person.identityId,
    resolved: person.resolved,
    isSelf: person.isSelf,
    role,
    actionCount: role === "owner" && item?.kind === "action" ? 1 : 0,
    decisionCount: role === "owner" && item?.kind === "decision" ? 1 : 0,
    pendingCount: role === "owner" && item?.reviewStatus === "needs_review" ? 1 : 0,
    itemIds: item ? [item.id] : [],
  };
  nodes.set(id, node);
  return node;
}

function upsertLink(
  links: Map<string, AccountabilityGraphLink>,
  source: string,
  target: string,
  type: AccountabilityGraphLinkType,
  label: string,
  item: MyntItem,
  relatedItems: MyntItem[] = [item],
) {
  if (source === target) {
    return;
  }
  const directional = type === "assigned_action" || type === "owns_decision";
  const [left, right] = directional || source < target ? [source, target] : [target, source];
  const id = `${type}:${left}->${right}`;
  const current = links.get(id);
  if (current) {
    const knownItemIds = new Set(current.itemIds);
    current.weight += 1;
    current.pendingCount += relatedItems.filter((relatedItem) => relatedItem.reviewStatus === "needs_review" && !knownItemIds.has(relatedItem.id)).length;
    current.itemIds = unique([...current.itemIds, ...relatedItems.map((relatedItem) => relatedItem.id)]);
    current.meetingIds = unique([...current.meetingIds, ...relatedItems.map((relatedItem) => relatedItem.meetingId)]);
    return;
  }
  links.set(id, {
    id,
    source: left,
    target: right,
    type,
    label,
    weight: 1,
    itemIds: unique(relatedItems.map((relatedItem) => relatedItem.id)),
    meetingIds: unique(relatedItems.map((relatedItem) => relatedItem.meetingId)),
    pendingCount: relatedItems.filter((relatedItem) => relatedItem.reviewStatus === "needs_review").length,
  });
}

export function buildAccountabilityGraph(items: MyntItem[], options: BuildAccountabilityGraphOptions): AccountabilityGraph {
  const nodes = new Map<string, AccountabilityGraphNode>();
  const links = new Map<string, AccountabilityGraphLink>();
  const assertionNodesByMeeting = new Map<string, AccountabilityGraphAssertionNode[]>();
  const conceptItems = new Map<string, MyntItem[]>();
  const visibleItems = items.filter((item) => shouldIncludeItem(item, options));
  const identities = options.identities;

  for (const item of visibleItems) {
    const owner = upsertPersonNode(nodes, item.person, "owner", item);
    const assertion: AccountabilityGraphAssertionNode = {
      id: assertionNodeId(item),
      nodeType: "assertion",
      label: item.kind === "action" ? `Action: ${item.summary}` : `Decision: ${item.summary}`,
      assertionId: item.assertionId,
      itemId: item.id,
      kind: item.kind,
      summary: item.summary,
      reviewStatus: item.reviewStatus,
      status: item.status,
      meetingId: item.meetingId,
      meetingTitle: item.meetingTitle,
      meetingDate: item.meetingDate,
      ownerPersonId: item.person.id,
      concept: item.concept && item.concept.status === "active" ? { id: item.concept.id, label: item.concept.label, summary: item.concept.summary, assignmentSource: item.concept.assignmentSource, confidence: item.concept.confidence } : null,
    };
    nodes.set(assertion.id, assertion);
    assertionNodesByMeeting.set(item.meetingId, [...(assertionNodesByMeeting.get(item.meetingId) || []), assertion]);
    if (assertion.concept) {
      conceptItems.set(assertion.concept.id, [...(conceptItems.get(assertion.concept.id) ?? []), item]);
    }

    upsertLink(
      links,
      owner.id,
      assertion.id,
      item.kind === "action" ? "assigned_action" : "owns_decision",
      item.kind === "action" ? "Assigned action" : "Owned decision",
      item,
    );

    for (const association of item.associations) {
      const associationPerson = personRefFromAssociation(association, identities);
      if (!options.includeSelf && associationPerson.isSelf) {
        continue;
      }
      const associated = upsertPersonNode(nodes, associationPerson, "associated", item);
      upsertLink(links, assertion.id, associated.id, "associated_identity", "Associated identity", item);
    }

    for (const participantRaw of item.meetingParticipants) {
      const participant = personRefFromRaw(participantRaw, identities);
      if (!options.includeSelf && participant.isSelf) {
        continue;
      }
      const participantNode = upsertPersonNode(nodes, participant, "participant", item);
      upsertLink(links, participantNode.id, assertion.id, "participant_context", "Meeting participant", item);
    }
  }

  for (const meetingAssertions of assertionNodesByMeeting.values()) {
    for (let index = 0; index < meetingAssertions.length; index += 1) {
      for (let next = index + 1; next < meetingAssertions.length; next += 1) {
        const left = meetingAssertions[index];
        const right = meetingAssertions[next];
        const leftItem = visibleItems.find((candidate) => candidate.id === left.itemId);
        const rightItem = visibleItems.find((candidate) => candidate.id === right.itemId);
        if (leftItem && rightItem) {
          upsertLink(links, left.id, right.id, "same_meeting", "Same meeting", leftItem, [leftItem, rightItem]);
        }
      }
    }
  }

  for (const [conceptId, groupedItems] of conceptItems.entries()) {
    const firstConcept = groupedItems.find((item) => item.concept)?.concept!;
    const people = new Set<string>();
    const meetings = new Map<string, { meetingId: string; title: string; date: string }>();
    const confidences: number[] = [];
    for (const item of groupedItems) {
      people.add(item.person.displayName);
      for (const association of item.associations) people.add(association.displayName);
      for (const participant of item.meetingParticipants) people.add(participant);
      meetings.set(item.meetingId, { meetingId: item.meetingId, title: item.meetingTitle, date: item.meetingDate });
      if (typeof item.concept?.confidence === "number" && Number.isFinite(item.concept.confidence)) confidences.push(item.concept.confidence);
    }
    const conceptNode: AccountabilityGraphConceptNode = {
      id: conceptNodeId(conceptId),
      nodeType: "concept",
      label: firstConcept.label,
      conceptId,
      summary: firstConcept.summary,
      assertionCount: groupedItems.length,
      actionCount: groupedItems.filter((item) => item.kind === "action").length,
      decisionCount: groupedItems.filter((item) => item.kind === "decision").length,
      pendingReviewCount: groupedItems.filter((item) => item.reviewStatus === "needs_review").length,
      people: [...people].sort((left, right) => left.localeCompare(right)),
      recentMeetings: [...meetings.values()].sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title)).slice(0, 5),
      assignmentSources: unique(groupedItems.map((item) => item.concept?.assignmentSource ?? "auto")),
      averageConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    };
    nodes.set(conceptNode.id, conceptNode);
    for (const item of groupedItems) {
      const assertion = nodes.get(assertionNodeId(item));
      if (assertion?.nodeType === "assertion") {
        upsertLink(links, conceptNode.id, assertion.id, "semantic_group", "Semantic group", item);
      }
    }
  }

  const graphNodes = [...nodes.values()].sort((left, right) => {
    if (left.nodeType !== right.nodeType) {
      const order = { person: 0, concept: 1, assertion: 2 } satisfies Record<AccountabilityGraphNode["nodeType"], number>;
      return order[left.nodeType] - order[right.nodeType];
    }
    return left.label.localeCompare(right.label);
  });
  const graphLinks = [...links.values()].sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  const assertions = graphNodes.filter((node): node is AccountabilityGraphAssertionNode => node.nodeType === "assertion");

  return {
    nodes: graphNodes,
    links: graphLinks,
    stats: {
      people: graphNodes.filter((node) => node.nodeType === "person").length,
      assertions: assertions.length,
      actions: assertions.filter((node) => node.kind === "action").length,
      decisions: assertions.filter((node) => node.kind === "decision").length,
      pending: assertions.filter((node) => node.reviewStatus === "needs_review").length,
      concepts: graphNodes.filter((node) => node.nodeType === "concept").length,
    },
  };
}

function normalizeActionStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/gu, "_") ?? "";
  return normalized || "todo";
}

export function deriveAccountabilityConceptSummaries(items: MyntItem[], visibleItemIds?: Set<string>): AccountabilityConceptSummary[] {
  const visibleItems = items.filter((item) => !visibleItemIds || visibleItemIds.has(item.id));
  const grouped = new Map<string, MyntItem[]>();
  for (const item of visibleItems) {
    if (!item.concept || item.concept.status !== "active") {
      continue;
    }
    grouped.set(item.concept.id, [...(grouped.get(item.concept.id) ?? []), item]);
  }
  return [...grouped.entries()]
    .map(([conceptId, conceptItems]) => {
      const firstConcept = conceptItems.find((item) => item.concept)?.concept!;
      const people = new Set<string>();
      const owners = new Set<string>();
      const meetings = new Map<string, { meetingId: string; title: string; date: string }>();
      const confidences: number[] = [];
      for (const item of conceptItems) {
        people.add(item.person.displayName);
        owners.add(item.person.id);
        for (const association of item.associations) {
          people.add(association.displayName);
        }
        for (const participant of item.meetingParticipants) {
          people.add(participant);
        }
        meetings.set(item.meetingId, { meetingId: item.meetingId, title: item.meetingTitle, date: item.meetingDate });
        if (typeof item.concept?.confidence === "number" && Number.isFinite(item.concept.confidence)) confidences.push(item.concept.confidence);
      }
      const recentMeetings = [...meetings.values()].sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title));
      const actionCount = conceptItems.filter((item) => item.kind === "action").length;
      const decisionCount = conceptItems.filter((item) => item.kind === "decision").length;
      const openActions = conceptItems.filter((item) => item.kind === "action" && normalizeActionStatus(item.status) !== "done").length;
      const pendingReviewCount = conceptItems.filter((item) => item.reviewStatus === "needs_review").length;
      const fragmentedOwnerCount = owners.size;
      const assignmentSources = unique(conceptItems.map((item) => item.concept?.assignmentSource ?? "auto"));
      const sortedConceptItems = [...conceptItems].sort((left, right) => right.meetingDate.localeCompare(left.meetingDate) || left.summary.localeCompare(right.summary));
      return {
        conceptId,
        label: firstConcept.label,
        summary: firstConcept.summary,
        actionCount,
        decisionCount,
        assertionCount: conceptItems.length,
        involvedPeople: [...people].sort((left, right) => left.localeCompare(right)),
        recentMeetings,
        openActions,
        pendingReviewCount,
        assignedItems: sortedConceptItems,
        representativeItems: sortedConceptItems.slice(0, 6),
        fragmentedOwnerCount,
        landscapeRank: recentMeetings.length * 4 + conceptItems.length * 2,
        attentionRank: openActions * 4 + pendingReviewCount * 3 + Math.max(0, fragmentedOwnerCount - 1) * 2,
        assignmentSources,
        primarySource: assignmentSources.includes("semantic_auto") ? "semantic_auto" : assignmentSources.includes("manual") ? "manual" : assignmentSources[0] ?? "auto",
        averageConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
      } satisfies AccountabilityConceptSummary;
    })
    .sort((left, right) => right.landscapeRank - left.landscapeRank || left.label.localeCompare(right.label));
}
