import { z } from "zod";
import { defineRecord, modelBlockSchema, modelCompletionSchema, modelInputPartsSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";
import { agentMessageSenderSchema } from "./messaging.ts";

/** The record source of an input message is the receiving agent; the communication sender is represented independently by sender. */
export const AgentInputMessage = defineRecord(builtin.name("agent.input-message"), {
  schema: z.object({ parts: modelInputPartsSchema, startsTurn: z.boolean(), sender: agentMessageSenderSchema }),
});
export const Execution = defineRecord(builtin.name("agent.execution"), {
  schema: z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
});
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
