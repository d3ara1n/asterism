import { z } from "zod";
import { modelExpressionSchema, modelSchema, modelProviderInputSchema, thinkingSchema } from "./configuration.ts";
export { jsonSchema, type Json } from "@asterism-app/sdk/contracts";
export { toolOutcomeSchema, type ToolOutcome } from "@asterism-app/sdk/contracts";

/** The SDK requires a nonempty credential placeholder; transport removes auth headers from unauthenticated requests. */
export const unauthenticatedApiKey = "no-auth";

const id = z.string().min(1).max(160);
export { modelUsageSchema as usageSchema, type Usage } from "@asterism-app/sdk/contracts";
export const modelSettingsSchema = z.strictObject({
  provider: modelProviderInputSchema,
  model: modelSchema, thinking: thinkingSchema.nullable(),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export function modelScope(settings: ModelSettings): string {
  return JSON.stringify([settings.provider.id, settings.provider.protocol, settings.provider.baseUrl, settings.model.modelId]);
}
/** Model expression for records: `<providerId>/<modelId>[:<thinking>]`; parameters still use structured fields. */
export function modelExpression(settings: Pick<ModelSettings, "thinking"> & { provider: { id: string }; model: { modelId: string } }): string {
  return `${settings.provider.id}/${settings.model.modelId}${settings.thinking ? `:${settings.thinking}` : ""}`;
}
export { agentSelectionSchema, type AgentSelection } from "@asterism-app/builtin-api/contracts";
