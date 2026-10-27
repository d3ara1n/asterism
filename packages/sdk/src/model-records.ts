/** Shared payloads for model execution; consuming plugins declare RecordContract identities, and the SDK does not create a separate history. */
import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import { toolOutcomeSchema } from "./tool-result.ts";
import { presentationSchema, type DataContract } from "./presentation.ts";
import type { ModelCompletion } from "./models.ts";
import { errorDetailsSchema } from "./error-details.ts";

const id = z.string().min(1).max(160);
export const modelUsageSchema = z.strictObject({
  input: z.number().nonnegative().nullable(), output: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(), reasoning: z.number().nonnegative().nullable(),
  cacheRead: z.number().nonnegative().nullable(), cacheWrite: z.number().nonnegative().nullable(),
});
/** Dates and times locate events; millisecond offsets come from the same monotonic clock, not from subtracting wall-clock timestamps. */
export const requestTimingSchema = z.strictObject({
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  firstOutputMs: z.number().nonnegative().nullable(),
  firstTextMs: z.number().nonnegative().nullable(),
  firstReasoningMs: z.number().nonnegative().nullable(),
  lastOutputMs: z.number().nonnegative().nullable(),
  outputChunks: z.number().int().nonnegative(),
  outcome: z.enum(["completed", "failed", "cancelled"]),
});
export type RequestTiming = z.infer<typeof requestTimingSchema>;

export const modelSourceSchema = z.strictObject({ model: z.string(), adapter: z.string(), scope: z.string() });
export const modelCompletionSchema = z.strictObject({ usage: modelUsageSchema.nullable(), finishReason: z.string(),
  rawFinishReason: z.string().nullable(), providerResponseId: z.string().nullable(), timing: requestTimingSchema.optional(),
  extensions: z.array(presentationSchema).optional() });
/** Decode only domain extensions known to the caller; unknown or undecodable extensions do not affect the public terminal state. */
export function completionData<T extends Json>(completion: ModelCompletion | null | undefined, contract: DataContract<T>): T | null {
  const extension = completion?.extensions?.find(value => value.contract.id === contract.id);
  if (!extension) return null;
  const result = contract.schema.safeParse(structuredClone(extension.data));
  return result.success ? result.data : null;
}
const block = { responseId: id, requestParentId: id.nullable(), ordinal: z.number().int().nonnegative(),
  complete: z.boolean(), continuation: jsonSchema, source: modelSourceSchema, completion: modelCompletionSchema.nullable().optional(),
  /** Block generation start and end times (millisecond timestamps); blocks finalized before generation ends have a null end time, and unrecorded times are omitted. See outcome for tool execution times. */
  startedAt: z.number().nonnegative().optional(), endedAt: z.number().nonnegative().nullable().optional() };
export const modelBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...block, kind: z.literal("thinking"), text: z.string(), summary: z.string() }),
  z.strictObject({ ...block, kind: z.literal("text"), text: z.string() }),
  z.strictObject({ ...block, kind: z.literal("toolcall"), callId: id, name: id,
    /** Original model text; retained only when parsed arguments are unavailable (the call is incomplete), otherwise arguments is authoritative. */
    argumentsText: z.string().nullable(), arguments: jsonSchema, outcome: toolOutcomeSchema.nullable() })
    .refine(data => data.complete === (data.outcome !== null), "Complete tool calls must have an outcome."),
]);
/** Terminal state is embedded in finalized blocks; execution notifications carry only feedback, not response identity or measurements. */
export const modelRunRecordSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
  z.strictObject({ type: z.literal("diagnostic"), origin: z.enum(["model", "software"]), code: z.string(), message: z.string(), level: z.enum(["error", "warning"]), details: errorDetailsSchema.optional() }),
]);
