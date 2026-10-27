import { z } from "zod";
import { defineRecord } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

/**
 * Session-level naming events: append one for each naming operation that takes effect; existing events are not rewritten.
 * Automatic naming includes the triggering message, level, and generating model; subsequent decisions read only the latest event.
 */
export const SessionNamed = defineRecord(builtin.name("session.named"), {
  schema: z.strictObject({
    title: z.string().min(1).max(160),
    source: z.enum(["user", "agent", "auto"]),
    auto: z.strictObject({
      level: z.enum(["initial", "refined"]),
      messageId: z.string(),
      model: z.string(),
    }).optional(),
  }).refine(data => (data.source === "auto") === (data.auto !== undefined), "Only automatic names carry naming metadata."),
});

export interface NamingApi {
  nameByUser(sessionId: string, title: string): void;
}
