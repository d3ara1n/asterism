import { z } from "zod";
import { defineRecord, modelRunRecordSchema, modelCompletionSchema, jsonSchema } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

/** 代理用户消息的公开记录契约；需要识别用户输入的插件导入它。 */
export const UserMessage = defineRecord(core.name("agent.user-message"), {
  version: 1, schema: z.object({ agentId: z.string(), text: z.string() }),
});
export const Execution = defineRecord(core.name("agent.execution"), { version: 1, schema: modelRunRecordSchema });
export const Notice = defineRecord(core.name("agent.notice"), {
  version: 1, schema: z.strictObject({ code: z.string(), message: z.string(), level: z.enum(["info", "warning", "error"]),
    response: modelCompletionSchema.extend({ responseId: z.string(), requestParentId: z.string().nullable(), model: z.string() }).optional() }),
});
export const ContextNotice = defineRecord(core.name("context"), {
  version: 1, schema: z.object({ text: z.string(), recipient: z.string().nullable(),
    origin: z.strictObject({ type: z.string(), version: z.number().int().positive(), data: jsonSchema }).optional() }),
});
