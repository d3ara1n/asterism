import { z } from "zod";
import { defineRecord, modelRunRecordSchema, modelCompletionSchema, modelInputPartsSchema } from "@atelier/sdk/contracts";
import { builtin } from "./identity.ts";

/** 代理用户消息的公开记录契约；接收代理即记录来源资源。需要识别用户输入的插件导入它。 */
export const UserMessage = defineRecord(builtin.name("agent.user-message"), {
  schema: z.object({ parts: modelInputPartsSchema }),
});
export const Execution = defineRecord(builtin.name("agent.execution"), { schema: modelRunRecordSchema });
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
export const Notice = defineRecord(builtin.name("agent.notice"), {
  schema: z.strictObject({ code: z.string(), message: z.string(), level: z.enum(["info", "warning", "error"]),
    response: modelCompletionSchema.extend({ responseId: z.string(), requestParentId: z.string().nullable(), model: z.string() }).optional() }),
});
