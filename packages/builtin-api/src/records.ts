import { z } from "zod";
import { defineRecord, modelBlockSchema, modelCompletionSchema, modelInputPartsSchema } from "@atelier/sdk/contracts";
import { builtin } from "./identity.ts";
import { agentMessageSenderSchema } from "./messaging.ts";

/** 输入消息的记录来源为接收代理；通信发送者由 sender 独立表达。 */
export const AgentInputMessage = defineRecord(builtin.name("agent.input-message"), {
  schema: z.object({ parts: modelInputPartsSchema, startsTurn: z.boolean(), sender: agentMessageSenderSchema }),
});
export const Execution = defineRecord(builtin.name("agent.execution"), {
  schema: z.strictObject({ type: z.literal("block"), block: modelBlockSchema }),
});
/** 摘要只替换模型输入的前缀；keptFrom 指向原样保留的首个历史节点。 */
export const ContextSummary = defineRecord(builtin.name("agent.context-summary"), {
  schema: z.strictObject({
    summary: z.string().trim().min(1),
    keptFrom: z.string().min(1),
    model: z.string().min(1),
    tokensBefore: z.number().nonnegative(),
    completion: modelCompletionSchema,
  }),
});
