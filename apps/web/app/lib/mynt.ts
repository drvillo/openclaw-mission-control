import fs from "node:fs";
import path from "node:path";
import { MISSION_CONTROL_STATE_DIR } from "./config";
import type { MeetingIndex, MeetingRecording, MeetingReviewItem } from "./meetings";
import type { ObsidianBoardPayload, ObsidianBoardTask } from "./openclaw";

const MYNT_STATE_PATH = path.join(MISSION_CONTROL_STATE_DIR, "mynt-identities.json");
const SELF_EMAIL = "francesco@lunarrails.io";
const SELF_NAME = "Francesco Vivoli";

export type MyntIdentity = {
  id: string;
  email: string;
  displayName: string;
  aliases: string[];
  isSelf?: boolean;
  inferred?: boolean;
};

export type MyntState = {
  version: 1;
  showSelfDefault: boolean;
  archivedItemIds: string[];
  identities: MyntIdentity[];
};

export type MyntPersonRef = {
  id: string;
  displayName: string;
  email: string | null;
  raw: string;
  isSelf: boolean;
  identityId: string | null;
  resolved: boolean;
};

export type MyntItem = {
  id: string;
  kind: "action" | "decision";
  person: MyntPersonRef;
  summary: string;
  status: string | null;
  confidence: string | null;
  score: number | null;
  evidenceTimestamp: string | null;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  obsidianRef: string;
  playbackUrl: string | null;
  recordingId: string;
  taskId: string | null;
  detailsRef: string | null;
  dueDate: string | null;
  dueText: string | null;
  archived: boolean;
};

export type MyntPerson = MyntPersonRef & {
  actionCount: number;
  decisionCount: number;
  totalCount: number;
  actions: MyntItem[];
  decisions: MyntItem[];
};

export type MyntDuplicateCandidate = {
  raw: string;
  email: string | null;
  displayName: string;
  source: "participant" | "action" | "decision";
  meetingId: string;
  meetingTitle: string;
  matchingIdentityIds: string[];
  count: number;
};

export type MyntArchivePreview = {
  cutoffDate: string;
  peopleAffected: number;
  itemIds: string[];
  itemCount: number;
  linkedTaskIds: string[];
  linkedTaskCount: number;
};

export type MyntIndex = {
  statePath: string;
  state: MyntState;
  people: MyntPerson[];
  peopleWithSelf: MyntPerson[];
  hiddenSelfCount: number;
  items: MyntItem[];
  archivedCount: number;
  identities: Array<MyntIdentity & { actionCount: number; decisionCount: number; totalCount: number }>;
  duplicates: MyntDuplicateCandidate[];
  archivePreview: MyntArchivePreview;
};

type ParsedActor = {
  raw: string;
  email: string | null;
  displayName: string;
};

function normalizeActor(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function identityKey(value: string) {
  return normalizeActor(value).toLowerCase();
}

function identityIdForName(value: string) {
  return `name:${identityKey(value)}`;
}

function isLikelyFullName(value: string) {
  const parsed = parseActor(value);
  if (!parsed || parsed.email) {
    return false;
  }
  const tokens = parsed.displayName.split(/\s+/u).filter((token) => /\p{L}/u.test(token));
  return tokens.length >= 2 && !/[&,/]/u.test(parsed.displayName);
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map(normalizeActor).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function defaultState(): MyntState {
  return {
    version: 1,
    showSelfDefault: false,
    archivedItemIds: [],
    identities: [
      {
        id: SELF_EMAIL,
        email: SELF_EMAIL,
        displayName: SELF_NAME,
        aliases: [SELF_NAME, SELF_EMAIL],
        isSelf: true,
      },
    ],
  };
}

function normalizeState(raw: Partial<MyntState> | null): MyntState {
  const fallback = defaultState();
  const identities = Array.isArray(raw?.identities) ? raw.identities : [];
  const hasSelf = identities.some((identity) => identity.email.toLowerCase() === SELF_EMAIL);
  return {
    version: 1,
    showSelfDefault: Boolean(raw?.showSelfDefault),
    archivedItemIds: Array.isArray(raw?.archivedItemIds) ? uniqueSorted(raw.archivedItemIds) : [],
    identities: (hasSelf ? identities : [...fallback.identities, ...identities]).map((identity) => ({
      id: normalizeActor(identity.id || identity.email || identity.displayName),
      email: normalizeActor(identity.email || "").toLowerCase(),
      displayName: normalizeActor(identity.displayName || identity.email || identity.id),
      aliases: uniqueSorted([...(identity.aliases || []), identity.displayName, identity.email].filter(Boolean) as string[]),
      isSelf: Boolean(identity.isSelf) || identity.email.toLowerCase() === SELF_EMAIL,
      inferred: Boolean(identity.inferred),
    })),
  };
}

export function loadMyntState(): MyntState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(MYNT_STATE_PATH, "utf8")) as Partial<MyntState>);
  } catch {
    const state = defaultState();
    saveMyntState(state);
    return state;
  }
}

export function saveMyntState(state: MyntState) {
  fs.mkdirSync(path.dirname(MYNT_STATE_PATH), { recursive: true });
  fs.writeFileSync(MYNT_STATE_PATH, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
}

export function parseActor(rawValue: string | null | undefined): ParsedActor | null {
  const raw = normalizeActor(String(rawValue || ""));
  if (!raw || raw.toLowerCase() === "unclear" || raw.toLowerCase() === "none") {
    return null;
  }
  const bracket = raw.match(/^(.+?)\s*<([^<>\s]+@[^<>\s]+)>$/u);
  if (bracket) {
    return { raw, displayName: normalizeActor(bracket[1]), email: bracket[2].toLowerCase() };
  }
  const email = raw.match(/[^\s<>]+@[^\s<>]+\.[^\s<>]+/u)?.[0]?.toLowerCase() ?? null;
  return { raw, displayName: email && raw === email ? email : raw.replace(email ?? "", "").trim() || raw, email };
}

function buildIdentityLookups(state: MyntState) {
  const byEmail = new Map<string, MyntIdentity>();
  const byAlias = new Map<string, MyntIdentity[]>();
  for (const identity of state.identities) {
    if (identity.email) {
      byEmail.set(identity.email.toLowerCase(), identity);
    }
    for (const alias of identity.aliases) {
      const key = identityKey(alias);
      if (!key) {
        continue;
      }
      byAlias.set(key, [...(byAlias.get(key) || []), identity]);
    }
  }
  return { byEmail, byAlias };
}

function inferFullNameIdentities(index: MeetingIndex, state: MyntState): MyntIdentity[] {
  const { byEmail, byAlias } = buildIdentityLookups(state);
  const inferred = new Map<string, MyntIdentity>();

  function inferredHasAlias(key: string) {
    return [...inferred.values()].some((identity) => identity.aliases.some((alias) => identityKey(alias) === key));
  }

  function add(rawValue: string | null | undefined) {
    const parsed = parseActor(rawValue);
    if (!parsed) {
      return;
    }
    if (parsed.email && !byEmail.has(parsed.email) && !inferred.has(`email:${parsed.email}`)) {
      inferred.set(`email:${parsed.email}`, {
        id: parsed.email,
        email: parsed.email,
        displayName: parsed.displayName,
        aliases: uniqueSorted([parsed.raw, parsed.displayName, parsed.email]),
        isSelf: parsed.email === SELF_EMAIL,
        inferred: true,
      });
      return;
    }
    if (parsed.email || !isLikelyFullName(parsed.displayName)) {
      return;
    }
    const key = identityKey(parsed.displayName);
    if (byAlias.has(key) || inferredHasAlias(key)) {
      return;
    }
    const displayName = parsed.displayName;
    inferred.set(key, {
      id: identityIdForName(displayName),
      email: "",
      displayName,
      aliases: [displayName],
      isSelf: key === identityKey(SELF_NAME),
      inferred: true,
    });
  }

  for (const meeting of index.meetings) {
    for (const participant of meeting.participants) {
      add(participant);
    }
    for (const action of meeting.actions) {
      add(action.assignee);
    }
    for (const decision of meeting.decisions) {
      add(decision.owner);
    }
  }

  return [...inferred.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function withInferredIdentities(index: MeetingIndex, state: MyntState): MyntState {
  const inferred = inferFullNameIdentities(index, state);
  if (inferred.length === 0) {
    return state;
  }
  return {
    ...state,
    identities: [...state.identities, ...inferred],
  };
}

function resolvePerson(rawValue: string | null | undefined, state: MyntState): MyntPersonRef | null {
  const parsed = parseActor(rawValue);
  if (!parsed) {
    return null;
  }
  const { byEmail, byAlias } = buildIdentityLookups(state);
  const emailIdentity = parsed.email ? byEmail.get(parsed.email) : null;
  if (emailIdentity) {
    return {
      id: `identity:${emailIdentity.id}`,
      displayName: emailIdentity.displayName,
      email: emailIdentity.email,
      raw: parsed.raw,
      isSelf: Boolean(emailIdentity.isSelf),
      identityId: emailIdentity.id,
      resolved: true,
    };
  }

  const aliasMatches = byAlias.get(identityKey(parsed.displayName)) || [];
  if (!parsed.email && aliasMatches.length === 1) {
    const identity = aliasMatches[0];
    return {
      id: `identity:${identity.id}`,
      displayName: identity.displayName,
      email: identity.email || null,
      raw: parsed.raw,
      isSelf: Boolean(identity.isSelf),
      identityId: identity.id,
      resolved: true,
    };
  }

  const key = parsed.email ? `email:${parsed.email}` : `raw:${identityKey(parsed.displayName)}`;
  return {
    id: key,
    displayName: parsed.displayName,
    email: parsed.email,
    raw: parsed.raw,
    isSelf: parsed.email === SELF_EMAIL || identityKey(parsed.displayName) === identityKey(SELF_NAME),
    identityId: null,
    resolved: false,
  };
}

function itemId(meeting: MeetingRecording, item: MeetingReviewItem, index: number) {
  return item.id || `${meeting.id}:${item.kind}:${index + 1}`;
}

function toMyntItem(meeting: MeetingRecording, reviewItem: MeetingReviewItem, index: number, state: MyntState): MyntItem | null {
  const rawPerson = reviewItem.kind === "action" ? reviewItem.assignee : reviewItem.owner;
  const person = resolvePerson(rawPerson, state);
  if (!person) {
    return null;
  }
  const id = itemId(meeting, reviewItem, index);
  return {
    id,
    kind: reviewItem.kind,
    person,
    summary: reviewItem.summary || reviewItem.label,
    status: reviewItem.status,
    confidence: reviewItem.confidence,
    score: reviewItem.score,
    evidenceTimestamp: reviewItem.evidenceTargetTime,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    meetingDate: meeting.date,
    obsidianRef: meeting.obsidianRef,
    playbackUrl: meeting.playbackUrl,
    recordingId: meeting.recordingId,
    taskId: reviewItem.taskId,
    detailsRef: reviewItem.detailsRef,
    dueDate: reviewItem.dueDate,
    dueText: reviewItem.dueText,
    archived: state.archivedItemIds.includes(id),
  };
}

function buildPeople(items: MyntItem[]) {
  const map = new Map<string, MyntPerson>();
  for (const item of items) {
    const current = map.get(item.person.id) || {
      ...item.person,
      actionCount: 0,
      decisionCount: 0,
      totalCount: 0,
      actions: [],
      decisions: [],
    };
    if (item.kind === "action") {
      current.actionCount += 1;
      current.actions.push(item);
    } else {
      current.decisionCount += 1;
      current.decisions.push(item);
    }
    current.totalCount += 1;
    map.set(current.id, current);
  }
  return [...map.values()].sort(
    (left, right) =>
      right.totalCount - left.totalCount ||
      right.actionCount - left.actionCount ||
      left.displayName.localeCompare(right.displayName),
  );
}

function duplicateKey(candidate: MyntDuplicateCandidate) {
  return `${candidate.source}:${identityKey(candidate.raw)}`;
}

function collectDuplicateCandidates(index: MeetingIndex, state: MyntState): MyntDuplicateCandidate[] {
  const { byEmail, byAlias } = buildIdentityLookups(state);
  const map = new Map<string, MyntDuplicateCandidate>();

  function add(rawValue: string | null | undefined, source: MyntDuplicateCandidate["source"], meeting: MeetingRecording) {
    const parsed = parseActor(rawValue);
    if (!parsed) {
      return;
    }
    if (!parsed.email && isLikelyFullName(parsed.displayName)) {
      return;
    }
    const emailMatch = parsed.email ? byEmail.get(parsed.email) : null;
    const aliasMatches = byAlias.get(identityKey(parsed.displayName)) || [];
    const resolvedUniquely = Boolean(emailMatch) || (!parsed.email && aliasMatches.length === 1);
    if (resolvedUniquely && !parsed.email) {
      return;
    }
    if (emailMatch && emailMatch.displayName === parsed.displayName) {
      return;
    }
    const candidate: MyntDuplicateCandidate = {
      raw: parsed.raw,
      email: parsed.email,
      displayName: parsed.displayName,
      source,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      matchingIdentityIds: emailMatch ? [emailMatch.id] : aliasMatches.map((identity) => identity.id),
      count: 1,
    };
    const key = duplicateKey(candidate);
    const current = map.get(key);
    if (current) {
      current.count += 1;
    } else {
      map.set(key, candidate);
    }
  }

  for (const meeting of index.meetings) {
    for (const participant of meeting.participants) {
      add(participant, "participant", meeting);
    }
    for (const action of meeting.actions) {
      add(action.assignee, "action", meeting);
    }
    for (const decision of meeting.decisions) {
      add(decision.owner, "decision", meeting);
    }
  }

  return [...map.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function identityCounts(identities: MyntIdentity[], people: MyntPerson[]) {
  const byIdentity = new Map(people.filter((person) => person.identityId).map((person) => [person.identityId, person]));
  return identities.map((identity) => {
    const person = byIdentity.get(identity.id);
    return {
      ...identity,
      actionCount: person?.actionCount ?? 0,
      decisionCount: person?.decisionCount ?? 0,
      totalCount: person?.totalCount ?? 0,
    };
  });
}

function isFathomTask(task: ObsidianBoardTask) {
  return Boolean(task.detail_body?.match(/^- source:\s*fathom\s*$/mu));
}

export function previewMyntArchive(items: MyntItem[], tasks: ObsidianBoardTask[] = [], olderThanDays = 30, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - olderThanDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const oldItems = items.filter((item) => !item.archived && item.meetingDate <= cutoffDate);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const linkedTaskIds = uniqueSorted(
    oldItems
      .map((item) => item.taskId)
      .filter((taskId): taskId is string => Boolean(taskId))
      .filter((taskId) => {
        const task = taskById.get(taskId);
        return Boolean(task && isFathomTask(task));
      }),
  );
  return {
    cutoffDate,
    peopleAffected: new Set(oldItems.map((item) => item.person.id)).size,
    itemIds: oldItems.map((item) => item.id),
    itemCount: oldItems.length,
    linkedTaskIds,
    linkedTaskCount: linkedTaskIds.length,
  };
}

export function buildMyntIndexFromState(index: MeetingIndex, state: MyntState, taskBoard?: ObsidianBoardPayload): MyntIndex {
  const effectiveState = withInferredIdentities(index, state);
  const items = index.meetings.flatMap((meeting) => [
    ...meeting.actions.map((item, idx) => toMyntItem(meeting, item, idx, effectiveState)),
    ...meeting.decisions.map((item, idx) => toMyntItem(meeting, item, idx, effectiveState)),
  ]).filter((item): item is MyntItem => Boolean(item));
  const activeItems = items.filter((item) => !item.archived);
  const peopleWithSelf = buildPeople(activeItems);
  const people = effectiveState.showSelfDefault ? peopleWithSelf : peopleWithSelf.filter((person) => !person.isSelf);
  return {
    statePath: MYNT_STATE_PATH,
    state: effectiveState,
    people,
    peopleWithSelf,
    hiddenSelfCount: peopleWithSelf.filter((person) => person.isSelf).reduce((sum, person) => sum + person.totalCount, 0),
    items,
    archivedCount: items.length - activeItems.length,
    identities: identityCounts(effectiveState.identities, peopleWithSelf),
    duplicates: collectDuplicateCandidates(index, effectiveState),
    archivePreview: previewMyntArchive(items, taskBoard?.tasks || []),
  };
}

export function buildMyntIndex(index: MeetingIndex, taskBoard?: ObsidianBoardPayload): MyntIndex {
  return buildMyntIndexFromState(index, loadMyntState(), taskBoard);
}

export function approveMyntAlias(identityId: string, rawAlias: string, identityDisplayName?: string) {
  const state = loadMyntState();
  const parsed = parseActor(rawAlias);
  if (!parsed) {
    throw new Error("Alias is required");
  }
  let identity = state.identities.find((item) => item.id === identityId || item.email === identityId);
  const inferredEmail = parseActor(identityId)?.email;
  if (!identity && (identityId.startsWith("name:") || inferredEmail)) {
    const displayName = normalizeActor(identityDisplayName || (inferredEmail ? identityId : identityId.slice("name:".length)));
    identity = {
      id: identityId,
      email: inferredEmail ?? "",
      displayName,
      aliases: uniqueSorted([displayName, inferredEmail ?? ""]),
      inferred: true,
    };
    state.identities.push(identity);
  }
  if (!identity) {
    throw new Error(`Unknown identity: ${identityId}`);
  }
  if (parsed.email && !identity.email) {
    identity.email = parsed.email;
  }
  identity.aliases = uniqueSorted([...identity.aliases, parsed.raw, parsed.displayName, parsed.email || ""]);
  saveMyntState(state);
  return identity;
}

export function archiveMyntItems(ids: string[]) {
  const state = loadMyntState();
  state.archivedItemIds = uniqueSorted([...state.archivedItemIds, ...ids]);
  saveMyntState(state);
  return state.archivedItemIds;
}
