export const TASK_ID_PATTERN = /\btask-\d{8}-\d{3}\b/u;
export const PACKET_ID_PATTERN = /\bSE-REVIEW-\d{3}\b/u;
export const INLINE_REFERENCE_PATTERN = /\b(task-\d{8}-\d{3}|SE-REVIEW-\d{3})\b/g;

export function isTaskId(value: string) {
  return TASK_ID_PATTERN.test(value);
}

export function isPacketId(value: string) {
  return PACKET_ID_PATTERN.test(value);
}

export function findInlineReferenceToken(value: string) {
  return value.match(INLINE_REFERENCE_PATTERN)?.[0] ?? null;
}

export function buildWorkTaskHref(taskId: string) {
  return `/work/tasks/${encodeURIComponent(taskId)}`;
}

export function buildOpsDayHref(date: string, packetId?: string | null) {
  return buildSelfEvolutionDayHref(date, packetId);
}

export function buildSelfEvolutionDayHref(date: string, packetId?: string | null) {
  const search = packetId ? `?packet=${encodeURIComponent(packetId)}` : "";
  return `/self-evolution/day/${encodeURIComponent(date)}${search}`;
}
