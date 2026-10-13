import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";
import { sourceSchema } from "./session.ts";

export const pluginEventsChannel = coreChannel("plugin-events");
export const pluginEventsVersion = 1;
const id = z.string().uuid();
const name = z.string().min(1).max(256);
export const eventFilterSchema = z.strictObject({ plugin: name.optional(), sessionId: name.optional(), resourceId: name.optional(), resourceKind: name.optional() });
export const subscriptionEndSchema = z.strictObject({
  reason: z.enum(["closed", "aborted", "unavailable", "invalid_contract", "consumer_failed", "disconnected"]),
  message: z.string().max(2048).optional(),
});
export const eventEnvelopeSchema = z.strictObject({
  contract: z.strictObject({ id: name }),
  emittedAt: z.string(),
  source: sourceSchema,
  data: jsonSchema,
});
export const eventControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("subscribe"), id, contract: name, source: eventFilterSchema.optional() }),
  z.strictObject({ type: z.literal("close"), id }),
  z.strictObject({ type: z.literal("reset") }),
]);
export const eventFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready"), id }),
  z.strictObject({ type: z.literal("event"), id, event: eventEnvelopeSchema }),
  z.strictObject({ type: z.literal("closed"), id, end: subscriptionEndSchema }),
]);
export type EventControl = z.infer<typeof eventControlSchema>;
export type EventFrame = z.infer<typeof eventFrameSchema>;
export const eventRuntimeControlSchema = z.strictObject({ kind: z.literal("plugin-events.control"), version: z.literal(pluginEventsVersion), control: eventControlSchema });
export const eventRuntimeFrameSchema = z.strictObject({ kind: z.literal("plugin-events.frame"), version: z.literal(pluginEventsVersion), frame: eventFrameSchema });
export interface EventBridge {
  send(control: EventControl): void;
  onFrame(listener: (frame: EventFrame) => void): () => void;
}
