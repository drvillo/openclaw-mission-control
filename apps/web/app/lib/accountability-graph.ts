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
};

export type AccountabilityGraphNode = AccountabilityGraphPersonNode | AccountabilityGraphAssertionNode;

export type AccountabilityGraphLinkType = "assigned_action" | "owns_decision" | "associated_identity" | "participant_context" | "same_meeting";

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
  };
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
    };
    nodes.set(assertion.id, assertion);
    assertionNodesByMeeting.set(item.meetingId, [...(assertionNodesByMeeting.get(item.meetingId) || []), assertion]);

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

  const graphNodes = [...nodes.values()].sort((left, right) => {
    if (left.nodeType !== right.nodeType) {
      return left.nodeType === "person" ? -1 : 1;
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
    },
  };
}
