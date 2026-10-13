import { z } from "zod";
import { defineRecord, modelRunRecordSchema, modelCompletionSchema, modelInputPartsSchema } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

/** 代理用户消息的公开记录契约；接收代理即记录来源资源。需要识别用户输入的插件导入它。 */
export const UserMessage = defineRecord(core.name("agent.user-message"), {
  schema: z.object({ parts: modelInputPartsSchema }),
});
export const Execution = defineRecord(core.name("agent.execution"), { schema: modelRunRecordSchema });
export const Notice = defineRecord(core.name("agent.notice"), {
  schema: z.strictObject({ code: z.string(), message: z.string(), level: z.enum(["info", "warning", "error"]),
    response: modelCompletionSchema.extend({ responseId: z.string(), requestParentId: z.string().nullable(), model: z.string() }).optional() }),
});
