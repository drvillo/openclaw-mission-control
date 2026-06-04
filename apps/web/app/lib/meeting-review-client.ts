import type { MyntIndex, MyntItem } from "./mynt";

export type MeetingReviewOperation = "accept" | "reject";
export type MeetingReviewPayloadItem = { kind: "action" | "decision"; assertionId: string };
export type MeetingReviewSuccess = { ok: true; summary: string; payload?: unknown };
export type MeetingReviewResponse = MeetingReviewSuccess | { ok: false; error: string };
export type ReassignActionPayload = { reassigned?: number; assertionId?: string; assignee?: string };

export function meetingReviewPayloadItems(items: MyntItem[], options: { pendingOnly?: boolean } = {}): MeetingReviewPayloadItem[] {
  return items
    .filter((item): item is MyntItem & { assertionId: string } => Boolean(item.assertionId) && (!options.pendingOnly || item.reviewStatus === "needs_review"))
    .map((item) => ({ kind: item.kind, assertionId: item.assertionId }));
}

export async function postMeetingReview(body: Record<string, unknown>): Promise<MeetingReviewSuccess> {
  const response = await fetch("/api/meeting-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as MeetingReviewResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
  }
  return payload;
}

function actorKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function personForAssignee(assignee: string, identities: MyntIndex["identities"]): MyntItem["person"] {
  const key = actorKey(assignee);
  const identity = identities.find(
    (item) => actorKey(item.displayName) === key || item.aliases.some((alias) => actorKey(alias) === key) || actorKey(item.email) === key,
  );
  if (identity) {
    return {
      id: `identity:${identity.id}`,
      displayName: identity.displayName,
      email: identity.email || null,
      raw: assignee,
      isSelf: Boolean(identity.isSelf),
      identityId: identity.id,
      resolved: true,
    };
  }
  return {
    id: `raw:${key}`,
    displayName: assignee,
    email: null,
    raw: assignee,
    isSelf: false,
    identityId: null,
    resolved: false,
  };
}
