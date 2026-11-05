import { z } from "zod";
import { defineChannel, defineTool, jsonSchema, modelCompletionSchema, modelSourceSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

const peekQuestionSchema = z.strictObject({
  question: z.string().trim().min(1).describe("The question to investigate in this Agent's saved records."),
  includeThinking: z.boolean().optional().describe("Include saved readable thinking. Defaults to false."),
}).describe("Question and optional access to saved readable thinking.");

export const Peek = defineTool({
  id: builtin.name("tool.peek"), name: "peek",
  description: "Investigate an Agent's saved timeline records and return a concise summary or explanation using the utility model.",
  guidelines: [
    "target selects an Agent according to the resource implementation's schema.",
    "question describes what to summarize or explain and includes context for follow-up questions.",
    "Each call reads a fresh, fixed snapshot of the selected Agent's current timeline, including records preceding context compression.",
    "includeThinking admits saved readable thinking into the investigation; its default is false.",
  ],
  argsSchema: peekQuestionSchema,
});
export const peekResultSchema = z.strictObject({
  snapshot: z.strictObject({ nodeId: z.string().nullable(), capturedAt: z.string(), records: z.number().int().nonnegative() }),
  phase: z.enum(["investigating", "thinking", "searching", "reading", "writing", "done"]),
  report: z.string(),
  round: z.number().int().nonnegative(),
  requests: z.array(z.strictObject({ source: modelSourceSchema.nullable(), completion: modelCompletionSchema })),
  queries: z.array(z.strictObject({ tool: z.string(), arguments: jsonSchema, records: z.array(z.string()) })),
}).describe("Investigation progress or report, fixed snapshot position, request measurements and retrieved record references.");
export type PeekResult = z.infer<typeof peekResultSchema>;

/** Prior exchanges belong to the caller's temporary conversation, independently of the investigated timeline. */
export const peekExchangeSchema = z.strictObject({
  question: z.string(),
  report: z.string(),
  outcome: z.enum(["succeeded", "partial", "cancelled", "failed"]),
});
export type PeekExchange = z.infer<typeof peekExchangeSchema>;
export const peekInputSchema = peekQuestionSchema.extend({
  history: z.array(peekExchangeSchema).optional(),
});
export type PeekInput = z.infer<typeof peekInputSchema>;
export type PeekOutcome =
  | { kind: "succeeded"; data: PeekResult }
  | { kind: "partial"; data: PeekResult; message: string }
  | { kind: "cancelled"; data?: PeekResult; message: string }
  | { kind: "failed"; data?: PeekResult; error: { code: string; message: string } };
export type PeekEvent = { type: "progress"; data: PeekResult } | { type: "result"; result: PeekOutcome };
export interface PeekOptions {
  signal: AbortSignal;
}
/** Each invocation captures fresh evidence. Callers explicitly supply any earlier Peek exchanges. */
export interface PeekClient {
  stream(input: PeekInput, options: PeekOptions): AsyncIterable<PeekEvent>;
  run(input: PeekInput, options: PeekOptions & { onProgress?: (data: PeekResult) => void }): Promise<PeekOutcome>;
}
/** One investigation per channel; closing it cancels that investigation. */
export const PeekChannel = defineChannel<PeekInput, PeekEvent>(builtin.name("agent.peek.channel"));

export function peekToModel(data: PeekResult): string {
  return data.report;
}
