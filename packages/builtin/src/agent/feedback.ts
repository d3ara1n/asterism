import { z } from "zod";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { errorDetailsSchema } from "@asterism-app/sdk/contracts";

export const agentFeedbackSchema = z.strictObject({
  origin: z.enum(["model", "software"]), code: z.string(), message: z.string(),
  level: z.enum(["warning", "error"]), details: errorDetailsSchema.optional(),
  responseId: z.string().optional(),
});
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;
export const inlineFeedbackSchema = agentFeedbackSchema.extend({
  id: z.string(), afterNodeId: z.string().nullable(),
});
export type InlineFeedback = z.infer<typeof inlineFeedbackSchema>;

/** Compression activity is runtime feedback; a persistent summary record takes over on success. */
export const compressionActivitySchema = z.strictObject({
  id: z.string(), afterNodeId: z.string().nullable(),
  status: z.enum(["running", "failed", "cancelled"]),
});
export type CompressionActivity = z.infer<typeof compressionActivitySchema>;
/** Live retry state; resumeAt is set while waiting and null once the retried request is running. */
export const agentActivitySchema = z.strictObject({
  attempt: z.number().int().positive(), max: z.number().int().positive(), resumeAt: z.number().nullable(),
});
export type AgentActivity = z.infer<typeof agentActivitySchema>;

/** Software faults are delivered through live notifications; model feedback is delivered through the Agent's in-memory projection. */
export const AgentSoftwareFeedback = builtin.event("agent.software-feedback", {
  source: "resource",
  semantics: { kind: "occurrence" },
  schema: agentFeedbackSchema,
});

/** Model adapters explicitly mark the source; other local exceptions are software processing failures. */
export function feedbackOrigin(error: unknown): AgentFeedback["origin"] {
  return error && typeof error === "object" && "origin" in error && error.origin === "model" ? "model" : "software";
}
