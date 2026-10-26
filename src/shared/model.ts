import { z } from "zod";
import { modelExpressionSchema, modelSchema, modelProviderInputSchema, thinkingSchema } from "./configuration.ts";
export { jsonSchema, type Json } from "@asterism/sdk/contracts";
export { toolOutcomeSchema, type ToolOutcome } from "@asterism/sdk/contracts";

/** SDK 需要非空凭据占位；无鉴权请求在传输层移除认证头。 */
export const unauthenticatedApiKey = "no-auth";

const id = z.string().min(1).max(160);
export { modelUsageSchema as usageSchema, type Usage } from "@asterism/sdk/contracts";
export const modelSettingsSchema = z.strictObject({
  provider: modelProviderInputSchema,
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
export { agentSelectionSchema, type AgentSelection } from "@asterism/builtin-api/contracts";
