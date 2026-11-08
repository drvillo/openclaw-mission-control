import type { MeetingRecording, MeetingReviewItem } from "./meetings";
import type { MyntItem, MyntPerson } from "./mynt";

type SearchableValue = string | number | boolean | null | undefined;

function normalize(value: SearchableValue) {
  return String(value ?? "").trim().toLowerCase();
}

function queryTokens(query: string) {
  return normalize(query).split(/\s+/u).filter(Boolean);
}

function matchesHaystack(values: SearchableValue[], query: string) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = values.map((value) => normalize(value)).filter(Boolean).join(" ");
  return tokens.every((token) => haystack.includes(token));
}

function reviewItemValues(item: MeetingReviewItem): SearchableValue[] {
  return [
    item.kind,
    item.id,
    item.assertionId,
    item.label,
    item.status,
    item.reviewStatus,
    item.owner,
    item.assignee,
    item.confidence,
    item.score,
    item.summary,
    item.evidence,
    item.evidenceTargetTime,
    ...(item.evidenceTimestamps ?? []),
    item.taskId,
    item.detailsRef,
    item.dueDate,
    item.dueText,
    ...(item.associations ?? []).flatMap((association) => [association.identityId, association.displayName, association.email]),
  ];
}

export function itemMatchesSearch(item: MyntItem | MeetingReviewItem, query: string) {
  if ("meetingTitle" in item) {
    return matchesHaystack(
      [
        item.kind,
        item.id,
        item.assertionId,
        item.reviewStatus,
        item.person.id,
        item.person.displayName,
        item.person.email,
        item.person.raw,
        item.person.identityId,
        item.summary,
        item.status,
        item.confidence,
        item.score,
        item.evidenceTimestamp,
        item.meetingId,
        item.meetingTitle,
        item.meetingDate,
        item.meetingParticipants.join(" "),
        item.obsidianRef,
        item.recordingId,
        item.taskId,
        item.detailsRef,
        item.dueDate,
        item.dueText,
        ...(item.associations ?? []).flatMap((association) => [association.identityId, association.displayName, association.email]),
        item.concept?.id,
        item.concept?.label,
        item.concept?.summary,
        item.concept?.status,
        item.concept?.assignmentSource,
        item.concept?.confidence,
      ],
      query,
    );
  }

  return matchesHaystack(reviewItemValues(item), query);
}

export function personMatchesSearch(person: MyntPerson, query: string) {
  const directMatch = matchesHaystack(
    [
      person.id,
      person.displayName,
      person.email,
      person.raw,
      person.identityId,
      person.resolved,
      person.isSelf,
    ],
    query,
  );
  return directMatch || person.actions.some((item) => itemMatchesSearch(item, query)) || person.decisions.some((item) => itemMatchesSearch(item, query));
}

export function filterPersonForSearch(person: MyntPerson, query: string): MyntPerson | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return person;
  }

  const actions = person.actions.filter((item) => itemMatchesSearch(item, query));
  const decisions = person.decisions.filter((item) => itemMatchesSearch(item, query));
  if (actions.length + decisions.length === 0 && !personMatchesSearch(person, query)) {
    return null;
  }

  return {
    ...person,
    actionCount: actions.length,
    decisionCount: decisions.length,
    totalCount: actions.length + decisions.length,
    actions,
    decisions,
  };
}

export function meetingMatchesSearch(meeting: MeetingRecording, query: string) {
  return matchesHaystack(
    [
      meeting.id,
      meeting.title,
      meeting.date,
      meeting.dateTime,
      meeting.month,
      meeting.recordingId,
      meeting.obsidianRef,
      meeting.participants.join(" "),
      ...meeting.actions.flatMap(reviewItemValues),
      ...meeting.decisions.flatMap(reviewItemValues),
    ],
    query,
  );
}
