import { z } from "zod";
import { defineRecord } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";
import { agentSelectionSchema } from "../../shared/model.ts";

/** 代理是普通资源：创建事件只记录身份；模型选择等可变数据属于资源私有状态。 */
export const Agent = core.resource("agent", z.object({}));
export const AgentView = core.data("agent.card", 2, z.strictObject({
  agentId: z.string(),
  selection: agentSelectionSchema.nullable(),
  selectionRevision: z.number().int().nonnegative(),
}));

const text = z.string().trim().min(1).max(100_000);
/** 代理卡片发出的资源命令；由代理控制器执行，会话只负责路由与记录事件。 */
export const agentCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("submit"), submissionId: z.string().uuid(), text }),
  z.strictObject({ type: z.literal("continue") }),
  z.strictObject({ type: z.literal("configure"), selection: agentSelectionSchema }),
  z.strictObject({ type: z.literal("cancel") }),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;
/** 创建代理资源时的初始数据。 */
/** title 可选，不填时用 agent 配置名。 */
export const agentCreateSchema = z.strictObject({ selection: agentSelectionSchema, title: z.string().trim().min(1).max(160).optional() });
/** 用户发给代理的消息：公开记录契约，其他插件可导入以识别首条消息等。 */
export const UserMessage = defineRecord(core.name("agent.user-message"), { version: 1, schema: z.object({ agentId: z.string(), text: z.string() }) });
