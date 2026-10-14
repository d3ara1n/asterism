import { z } from "zod";
import { modelExpressionSchema, modelSchema, providerInputSchema, thinkingSchema } from "./configuration.ts";
export { jsonSchema, type Json } from "@atelier/sdk/contracts";
export { toolOutcomeSchema, type ToolOutcome } from "@atelier/sdk/contracts";

/** SDK 需要非空凭据占位；无鉴权请求在传输层移除认证头。 */
export const unauthenticatedApiKey = "no-auth";

const id = z.string().min(1).max(160);
export { modelUsageSchema as usageSchema, type Usage } from "@atelier/sdk/contracts";
export const modelSettingsSchema = z.strictObject({
  provider: providerInputSchema.extend({ revision: z.number().int().positive() }),
  model: modelSchema, thinking: thinkingSchema.nullable(),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export function modelScope(settings: ModelSettings): string {
  return JSON.stringify([settings.provider.id, settings.provider.protocol, settings.provider.baseUrl, settings.model.modelId]);
}
/** 记录用模型表达式 `<providerId>/<modelId>[:<thinking>]`；参数传递仍使用结构化字段。 */
export function modelExpression(settings: Pick<ModelSettings, "thinking"> & { provider: { id: string }; model: { modelId: string } }): string {
  return `${settings.provider.id}/${settings.model.modelId}${settings.thinking ? `:${settings.thinking}` : ""}`;
}
/** 代理当前选择：属于环境，可修改，不进会话树。 */
/** agent 为代理配置 ID；model 与 thinking 为显式覆盖，null 表示每次请求沿用角色默认值。 */
export const agentSelectionSchema = z.strictObject({ agent: id, model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable() });
export type AgentSelection = z.infer<typeof agentSelectionSchema>;
