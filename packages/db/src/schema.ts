import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const webhookEvents = sqliteTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  routeId: text("route_id"),
  flowId: text("flow_id"),
  status: text("status").notNull(),
  payloadPath: text("payload_path"),
  lastError: text("last_error"),
  attemptCount: integer("attempt_count").notNull().default(0),
  recordedAt: text("recorded_at").notNull(),
});

export const taskSnapshots = sqliteTable("task_snapshots", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  assignee: text("assignee"),
  flowId: text("flow_id"),
  recordedAt: text("recorded_at").notNull(),
});

