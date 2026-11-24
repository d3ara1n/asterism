import { z } from "zod";
import { errorDetailsSchema } from "@asterism-app/sdk/contracts";

/**
 * Feedback inside a turn has two forms. An incident is a failure: the request or the software around it went wrong and the
 * diagnostics stay reachable. An occurrence happened without failing: content was left out, or background work ran and
 * stopped. Neither describes how the turn itself ended; that is the turn outcome.
 */
export const incidentSchema = z.strictObject({
  form: z.literal("incident"),
  origin: z.enum(["model", "software"]), code: z.string(), message: z.string(),
  details: errorDetailsSchema.optional(),
  responseId: z.string().optional(),
});
export const occurrenceSchema = z.strictObject({
  form: z.literal("occurrence"),
  code: z.string(), message: z.string(),
  omittedFiles: z.array(z.string()).optional(),
});
export const agentFeedbackSchema = z.discriminatedUnion("form", [incidentSchema, occurrenceSchema]);
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;
export const inlineFeedbackSchema = z.discriminatedUnion("form", [
  incidentSchema.extend({ id: z.string(), afterNodeId: z.string().nullable() }),
  occurrenceSchema.extend({ id: z.string(), afterNodeId: z.string().nullable() }),
]);
export type InlineFeedback = z.infer<typeof inlineFeedbackSchema>;

/** Compression activity is runtime feedback; a persistent summary record takes over on success, and a failure carries its error details. */
export const compressionActivitySchema = z.strictObject({
  id: z.string(), afterNodeId: z.string().nullable(),
  status: z.enum(["running", "failed", "cancelled"]),
  details: errorDetailsSchema.optional(),
});
export type CompressionActivity = z.infer<typeof compressionActivitySchema>;
/** Live retry state; resumeAt is set while waiting and null once the retried request is running. */
export const agentActivitySchema = z.strictObject({
  attempt: z.number().int().positive(), max: z.number().int().positive(), resumeAt: z.number().nullable(),
});
export type AgentActivity = z.infer<typeof agentActivitySchema>;

/** Model adapters explicitly mark the source; other local exceptions are software processing failures. */
export function feedbackOrigin(error: unknown): z.infer<typeof incidentSchema>["origin"] {
  return error && typeof error === "object" && "origin" in error && error.origin === "model" ? "model" : "software";
}
