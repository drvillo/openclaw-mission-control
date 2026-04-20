import { z } from "zod";

export const FlowRouteSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  match: z.record(z.string(), z.string()),
  flowTemplate: z.string().min(1),
  ownerAgent: z.string().min(1),
});

export const EventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  eventType: z.string().min(1),
  routeId: z.string().min(1).optional(),
  flowId: z.string().min(1).optional(),
  status: z.string().min(1),
  recordedAt: z.string().min(1),
});

export type FlowRoute = z.infer<typeof FlowRouteSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

