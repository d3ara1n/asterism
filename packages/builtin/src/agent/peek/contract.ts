import { z } from "zod";
import { defineImplementation, defineTool, jsonSchema, modelCompletionSchema, modelSourceSchema } from "@asterism/sdk/contracts";
import { Agent, builtin } from "@asterism/builtin-api/contracts";

export const Peek = defineTool({
  id: builtin.name("tool.peek"), name: "peek",
  description: "Investigate an Agent's saved timeline records and return a focused report using the utility model.",
  guidelines: [
    "question describes the information to locate and includes context for follow-up questions.",
    "Each call reads a fresh, fixed snapshot of the selected Agent's current timeline, including records preceding context compression.",
    "includeThinking admits saved readable thinking into the investigation; its default is false.",
  ],
  argsSchema: z.strictObject({
    question: z.string().trim().min(1).describe("The question to investigate in this Agent's saved records."),
    includeThinking: z.boolean().optional().describe("Include saved readable thinking. Defaults to false."),
  }).describe("Question and optional access to saved readable thinking."),
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
export const AgentPeek = defineImplementation({
  ...builtin.data("agent.peek", peekResultSchema), resource: Agent, tool: Peek,
  targetSchema: z.null().describe("Null selects this Agent's saved timeline records."),
  effect: "read", execution: "parallel",
});
