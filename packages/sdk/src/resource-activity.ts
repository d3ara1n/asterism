import { z } from "zod";
import { defineCall } from "./calls.ts";
import { defineEvent } from "./events.ts";
import { uiTextSchema } from "./i18n.ts";

const activityBase = z.strictObject({
  id: z.string(),
  resource: z.strictObject({ sessionId: z.string(), id: z.string(), kind: z.string() }),
  title: uiTextSchema,
});
/** Live work or an open instance, independent of timeline occupancy and notification consumption. */
export const resourceActivitySchema = z.discriminatedUnion("kind", [
  activityBase.extend({ kind: z.literal("work"), progress: z.strictObject({ value: z.number().min(0).max(1) }).optional() }),
  activityBase.extend({ kind: z.literal("instance") }),
]);
export type ResourceActivity = z.infer<typeof resourceActivitySchema>;

/** Read live scopes without loading session bodies. Subscribe to changes before reading, including after reconnection. */
export const ReadResourceActivities = defineCall("asterism/resource-activities.read", {
  scope: "plugin", input: z.strictObject({}), output: z.array(resourceActivitySchema),
});
/** Invalidation only; the host retains current activities, while the event bus retains no state. */
export const ResourceActivitiesChanged = defineEvent("asterism/resource-activities", {
  schema: z.strictObject({}), source: "host", semantics: { kind: "snapshot", key: [] },
});

/** A one-shot notification; viewing consumes the reminder without changing activity or resolving business interactions. */
export const ResourceNoticeRaised = defineEvent("asterism/resource-notice", {
  schema: z.strictObject({ title: uiTextSchema, kind: z.enum(["attention", "success", "error"]) }),
  source: "resource", semantics: { kind: "occurrence" },
});
export type ResourceNotice = z.infer<typeof ResourceNoticeRaised.schema>;
