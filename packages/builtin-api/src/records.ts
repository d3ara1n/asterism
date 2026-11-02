import { z } from "zod";
import { defineRecord, defineOperationRecord, modelBlockSchema, modelToolCallBlockSchema, modelCompletionSchema, toolOutcomeSchema,
  type Decoded, type SessionRecord, type ModelBlock } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";
import { agentMessageSenderSchema } from "./messaging.ts";
import { agentInputPartSchema } from "./input.ts";

/** The record source of an input message is the receiving agent; the communication sender is represented independently by sender. */
export const AgentInputMessage = defineRecord(builtin.name("agent.input-message"), {
  schema: z.object({ parts: z.array(agentInputPartSchema).min(1), startsTurn: z.boolean(), sender: agentMessageSenderSchema }),
});
export const Execution = defineRecord(builtin.name("agent.execution"), {
  schema: z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
});
/** Tool inputs keep their model-order position; execution fills the outcome once. */
export const ToolExecution = defineOperationRecord(builtin.name("agent.tool-execution"), {
  input: modelToolCallBlockSchema.refine(block => !block.complete && block.outcome === null && block.argumentsText === null,
    "Tool operation input must have complete arguments and a pending outcome."),
  output: toolOutcomeSchema,
});
export const executionRecordIds = [Execution.id, ToolExecution.id];
/** Read both immutable blocks and tool operations through the same historical block projection.
 * submitted marks a tool call handed to execution; without an outcome its effects are unknown rather than absent. */
export function decodeExecution(record: SessionRecord): Decoded<{ type: "block"; block: ModelBlock; submitted?: true }> | null {
  const operation = ToolExecution.decode(record);
  if (!operation) return Execution.decode(record);
  if (operation.status === "unknown") return operation;
  const { input, output } = operation.data;
  return { status: "known", record, data: { type: "block", submitted: true, block: {
    ...input, complete: output !== null, outcome: output,
  } } };
}
/** A summary replaces only the prefix of model input; keptFrom points to the first history node retained unchanged. */
export const ContextSummary = defineRecord(builtin.name("agent.context-summary"), {
  schema: z.strictObject({
    summary: z.string().trim().min(1),
    keptFrom: z.string().min(1),
    model: z.string().min(1),
    tokensBefore: z.number().nonnegative(),
    completion: modelCompletionSchema,
  }),
});
