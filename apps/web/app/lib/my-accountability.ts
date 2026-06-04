import type { MyntIndex, MyntItem } from "./mynt";

export const MY_ACCOUNTABILITY_ACTION_STATUSES = ["todo", "next", "in_progress", "done"] as const;

export type MyAccountabilityActionStatus = (typeof MY_ACCOUNTABILITY_ACTION_STATUSES)[number];

export type MyAccountabilityActionColumn = {
  id: MyAccountabilityActionStatus;
  label: string;
  items: MyntItem[];
};

export type MyAccountabilityDecisions = {
  pending: MyntItem[];
  accepted: MyntItem[];
};

export const MY_ACCOUNTABILITY_ACTION_COLUMNS: Array<{ id: MyAccountabilityActionStatus; label: string }> = [
  { id: "todo", label: "To do" },
  { id: "next", label: "Next" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export function normalizeMyAccountabilityActionStatus(status: string | null | undefined): MyAccountabilityActionStatus {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/gu, "_") ?? "";
  return MY_ACCOUNTABILITY_ACTION_STATUSES.includes(normalized as MyAccountabilityActionStatus)
    ? (normalized as MyAccountabilityActionStatus)
    : "todo";
}

export function selfAssignedItems(index: MyntIndex): MyntItem[] {
  return index.items.filter((item) => !item.archived && item.person.isSelf);
}

export function selfAssignedActions(index: MyntIndex): MyntItem[] {
  return selfAssignedItems(index).filter((item) => item.kind === "action");
}

export function selfAssignedDecisions(index: MyntIndex): MyntItem[] {
  return selfAssignedItems(index).filter((item) => item.kind === "decision");
}

export function pendingSelfAssignedActions(index: MyntIndex): MyntItem[] {
  return selfAssignedActions(index)
    .filter((item) => item.reviewStatus === "needs_review")
    .sort(compareNewestFirst);
}

export function acceptedSelfAssignedActions(index: MyntIndex): MyntItem[] {
  return selfAssignedActions(index)
    .filter((item) => item.reviewStatus === "accepted")
    .sort(compareNewestFirst);
}

export function groupAcceptedSelfAssignedActions(index: MyntIndex): MyAccountabilityActionColumn[] {
  const actions = acceptedSelfAssignedActions(index);
  return MY_ACCOUNTABILITY_ACTION_COLUMNS.map((column) => ({
    ...column,
    items: actions.filter((item) => normalizeMyAccountabilityActionStatus(item.status) === column.id),
  }));
}

export function partitionSelfAssignedDecisions(index: MyntIndex): MyAccountabilityDecisions {
  const decisions = selfAssignedDecisions(index).sort(compareNewestFirst);
  return {
    pending: decisions.filter((item) => item.reviewStatus === "needs_review"),
    accepted: decisions.filter((item) => item.reviewStatus === "accepted"),
  };
}

function compareNewestFirst(left: MyntItem, right: MyntItem) {
  return right.meetingDate.localeCompare(left.meetingDate) || right.id.localeCompare(left.id);
}
