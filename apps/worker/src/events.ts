import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EventEnvelope } from "@ocmc/shared";

function stableEventId(source: string, recordedAt: string, rawJson: string, index: number): string {
  const digest = createHash("sha1").update(`${source}:${recordedAt}:${index}:${rawJson}`).digest("hex");
  return `${source}-${digest}`;
}

function normalizeEvent(source: string, raw: Record<string, unknown>, index: number): EventEnvelope {
  const recordedAt = String(raw.recorded_at ?? new Date(0).toISOString());
  const event = (raw.event as Record<string, unknown> | undefined) ?? {};
  const result = (raw.result as Record<string, unknown> | undefined) ?? {};
  const eventId =
    String(
      event.event_id ??
        event.id ??
        result.event_id ??
        result.taskId ??
        raw.event_id ??
        stableEventId(source, recordedAt, JSON.stringify(raw), index),
    );
  const eventType = String(event.type ?? event.event_type ?? raw.kind ?? `${source}.event`);

  return {
    eventId,
    source,
    eventType,
    routeId: typeof result.route_id === "string" ? result.route_id : typeof raw.route_id === "string" ? String(raw.route_id) : undefined,
    flowId:
      typeof result.flow_id === "string"
        ? result.flow_id
        : typeof raw.flow_id === "string"
          ? String(raw.flow_id)
          : typeof event.flow_id === "string"
            ? event.flow_id
            : undefined,
    ownerAgent:
      typeof result.owner_agent === "string"
        ? result.owner_agent
        : typeof raw.owner_agent === "string"
          ? String(raw.owner_agent)
          : undefined,
    status: String(result.status ?? raw.status ?? "recorded"),
    payloadPath:
      typeof raw.event_file === "string"
        ? raw.event_file
        : typeof raw.payload_path === "string"
          ? raw.payload_path
          : undefined,
    correlationId:
      typeof event.message_id === "string"
        ? event.message_id
        : typeof event.recording_id === "number"
          ? String(event.recording_id)
          : undefined,
    lastError: typeof raw.error === "string" ? raw.error : undefined,
    attemptCount: Number(raw.attempt_count ?? 0),
    recordedAt,
    rawJson: JSON.stringify(raw, null, 2),
  };
}

export function collectWebhookEvents(stateDir: string): EventEnvelope[] {
  const eventsRoot = path.join(stateDir, "events");
  if (!existsSync(eventsRoot)) {
    return [];
  }

  return readdirSync(eventsRoot)
    .flatMap((source) => {
      const sourceDir = path.join(eventsRoot, source);
      if (!existsSync(sourceDir)) {
        return [];
      }
      return readdirSync(sourceDir)
        .filter((fileName) => fileName.endsWith(".jsonl"))
        .flatMap((fileName) => {
          const filePath = path.join(sourceDir, fileName);
          return readFileSync(filePath, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line, index) => normalizeEvent(source, JSON.parse(line) as Record<string, unknown>, index));
        });
    })
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}
