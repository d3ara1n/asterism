import {
  mcpSettingsSchema, shellSettingsSchema, modelExpressionSchema, parseModelExpression, thinkingSchema, type ThinkingLevel,
  thinkingLevels, modelCostSchema, uiTextSchema,
  modelProviderFixedFields, providerUsageIdSchema, usageProviderInfoSchema, modelProviderPresetSchema,
} from "@asterism-app/sdk/contracts";
export { modelExpressionSchema, parseModelExpression, formatModelExpression, modelReference, thinkingSchema, type ModelExpression, type ThinkingLevel } from "@asterism-app/sdk/contracts";
import { z } from "zod";
import { webProviderStateSchema, webProviderTypeSchema } from "@asterism-app/sdk/contracts";
import { modelCompatibilitySchema } from "./model-compatibility.ts";

const id = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(160);
/** Provider ID: an editable readable slug shared by code and users, without `/` or whitespace. */
export const modelProviderIdSchema = z.string().trim().min(1).max(160).regex(/^[^/\s]+$/u, "ModelProvider IDs cannot contain '/' or whitespace.");
/** Server model ID: a globally recognized model name allowing `/` but no whitespace. */
const serverModelId = z.string().trim().min(1).max(160).regex(/^\S+$/u, "Model IDs cannot contain whitespace.");
export const protocolSchema = z.enum(["openai-responses", "openai-chat", "anthropic"]);
/** Connection fields that can be fixed; authentication methods exclude credentials and compatibility settings also constrain model editing. */
export const modelProviderFixedFieldSchema = z.enum(modelProviderFixedFields);
export type ModelProviderFixedField = z.infer<typeof modelProviderFixedFieldSchema>;
const endpoint = z.string().trim().url().refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Use an HTTP(S) base URL without credentials, query, or fragment.");
export const modelProviderInputSchema = z.strictObject({
  id: modelProviderIdSchema, name, protocol: protocolSchema, baseUrl: endpoint, enabled: z.boolean(), auth: z.enum(["api_key", "none"]),
  compatibility: modelCompatibilitySchema,
  usage: providerUsageIdSchema.nullable().optional(),
  fixedFields: z.array(modelProviderFixedFieldSchema).refine(fields => new Set(fields).size === fields.length,
    "Fixed fields must be unique.").optional(),
});
export const credentialStateSchema = z.enum(["not_required", "missing", "available", "storage_unavailable", "decryption_failed"]);
export type CredentialState = z.infer<typeof credentialStateSchema>;
export const webProviderSchema = webProviderStateSchema.extend({ credentialState: credentialStateSchema });
export type WebProviderConfiguration = z.infer<typeof webProviderSchema>;
export const modelProviderSchema = modelProviderInputSchema.extend({ credentialState: credentialStateSchema });
export const modelInputSchema = z.strictObject({
  providerId: modelProviderIdSchema, name, modelId: serverModelId, enabled: z.boolean(),
  contextWindow: z.number().int().positive().nullable(),
  cost: modelCostSchema.nullable().default(null),
  // Retain only capabilities that change requests; servers decide whether files are accepted.
  capabilities: z.strictObject({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
  generation: z.strictObject({
    temperature: z.number().min(0).max(2).nullable(), topP: z.number().min(0).max(1).nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
  }),
  compatibility: modelCompatibilitySchema,
});
export const modelSchema = modelInputSchema;
export const testErrorSchema = z.enum(["configuration", "credential", "authentication", "model_unavailable", "rate_limit", "network", "timeout", "protocol", "server", "cancelled"]);
export const connectionTestSchema = z.strictObject({
  id, providerId: modelProviderIdSchema, model: modelExpressionSchema,
  state: z.enum(["running", "succeeded", "failed", "cancelled"]), startedAt: z.string(),
  durationMs: z.number().nonnegative().nullable(), error: testErrorSchema.nullable(), message: z.string().nullable(),
});
/** Discovery saves only explicitly declared endpoint data; missing fields do not mean unsupported. */
export const discoveredModelSchema = z.strictObject({
  modelId: serverModelId, name,
  contextWindow: z.number().int().positive().optional(),
  reasoning: z.boolean().optional(),
  thinkingLevels: z.array(thinkingSchema).optional(),
});
export const modelDiscoverySchema = z.strictObject({
  id, providerId: modelProviderIdSchema,
  state: z.enum(["running", "succeeded", "failed", "cancelled"]),
  models: z.array(discoveredModelSchema),
  error: z.enum(["configuration", "credential", "authentication", "unsupported", "rate_limit", "network", "timeout", "protocol", "server", "cancelled"]).nullable(),
});
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;
export type ModelDiscovery = z.infer<typeof modelDiscoverySchema>;
/** Manual creation and discovery additions share initial values; override defaults only with known data. */
export function createModelInput(providerId: string, model: DiscoveredModel): z.infer<typeof modelInputSchema> {
  return {
    providerId, modelId: model.modelId, name: model.name, enabled: true,
    contextWindow: model.contextWindow ?? null, cost: null, compatibility: [],
    capabilities: { reasoning: model.reasoning ?? true, tools: true, thinkingLevels: model.thinkingLevels ?? [...thinkingLevels] },
    generation: { temperature: null, topP: null, maxOutputTokens: null },
  };
}
export const sessionEntrySelectionSchema = z.strictObject({ pluginId: z.string().min(1), entryId: z.string().min(1) });
export const configurationSnapshotSchema = z.strictObject({
  mcp: mcpSettingsSchema,
  shell: shellSettingsSchema,
  sessionEntry: sessionEntrySelectionSchema.nullable(),
  webProviders: z.array(webProviderSchema),
  webProviderTypes: z.array(webProviderTypeSchema),
  modelProviders: z.array(modelProviderSchema), models: z.array(modelSchema),
  tests: z.array(connectionTestSchema), discoveries: z.array(modelDiscoverySchema), credentialStorageAvailable: z.boolean(),
  modelProviderPresets: z.array(modelProviderPresetSchema).optional(),
  usageProviders: z.array(usageProviderInfoSchema).optional(),
});
const credentialUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("keep") }), z.strictObject({ action: z.literal("clear") }),
  z.strictObject({ action: z.literal("replace"), value: z.string().trim().min(1).max(16_384) }),
]);
export const configurationCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("shell.set"), value: shellSettingsSchema }),
  z.strictObject({ type: z.literal("webProvider.save"), id: z.string().trim().min(1), enabled: z.boolean(), credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("webProvider.reorder"), ids: z.array(z.string().min(1)) }),
  z.strictObject({ type: z.literal("read") }),
  z.strictObject({ type: z.literal("sessionEntry.set"), value: sessionEntrySelectionSchema }),
  // Save targets the current ID; a different ID in value means rename.
  z.strictObject({ type: z.literal("modelProvider.save"), id: modelProviderIdSchema.nullable(), value: modelProviderInputSchema, credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("model.save"), id: modelExpressionSchema.nullable(), value: modelInputSchema }),
  z.strictObject({ type: z.literal("remove"), kind: z.enum(["modelProvider", "webProvider", "model"]), id: z.string().min(1).max(321) }),
  z.strictObject({ type: z.literal("test.start"), model: modelExpressionSchema }),
  z.strictObject({ type: z.literal("test.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.start"), providerId: modelProviderIdSchema }),
  z.strictObject({ type: z.literal("discovery.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.add"), id, modelIds: z.array(serverModelId).min(1) }),
  z.strictObject({ type: z.literal("model.parameters"), modelId: serverModelId }),
]);
export const modelParametersSchema = z.strictObject({
  contextWindow: modelInputSchema.shape.contextWindow.unwrap().optional(),
  cost: modelCostSchema.optional(),
  capabilities: modelInputSchema.shape.capabilities.partial(),
  generation: modelInputSchema.shape.generation.pick({ maxOutputTokens: true }).partial(),
});
export type ModelParameters = z.infer<typeof modelParametersSchema>;
/** Catalog fields fill the draft like manual edits; absent fields retain the user's values. */
export function applyModelParameters(draft: ProviderModel, parameters: ModelParameters): ProviderModel {
  return {
    ...draft, ...parameters,
    capabilities: { ...draft.capabilities, ...parameters.capabilities },
    generation: { ...draft.generation, ...parameters.generation },
  };
}
export const modelParameterUpdateSchema = z.strictObject({
  parameters: modelParametersSchema,
  source: z.string(),
  unfilled: z.array(z.enum(["contextWindow", "maxOutputTokens", "reasoning", "tools", "thinkingLevels", "cost"])),
});
export type ModelParameterUpdate = z.infer<typeof modelParameterUpdateSchema>;
export const configurationErrorSchema = z.strictObject({
  code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]), message: z.string(), display: uiTextSchema.optional(),
});
export const configurationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: configurationSnapshotSchema, savedId: z.string().max(321).nullable(), parameterUpdate: modelParameterUpdateSchema.optional() }),
  z.strictObject({ ok: z.literal(false), error: configurationErrorSchema }),
]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;
export type ModelProviderInput = z.infer<typeof modelProviderInputSchema>;
/** Connections without editing rules remain freely configurable; do not infer sources from names, endpoints, or catalogs. */
export function canEditModelProviderField(provider: Pick<ModelProviderInput, "fixedFields">, field: ModelProviderFixedField): boolean {
  return !provider.fixedFields?.includes(field);
}
export type ProviderModel = z.infer<typeof modelSchema>;
export type ConfigurationSnapshot = z.infer<typeof configurationSnapshotSchema>;
export type ConfigurationCommand = z.infer<typeof configurationCommandSchema>;
export type ConfigurationResult = z.infer<typeof configurationResultSchema>;
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
export type TestError = z.infer<typeof testErrorSchema>;
export interface ConfigurationBridge {
  execute(command: ConfigurationCommand): Promise<ConfigurationResult>;
  onChanged(listener: () => void): () => void;
}

/** Selectors and execution share this existence/enabled check without maintaining configuration references or cascaded state. */
export function resolveProviderModel(snapshot: Pick<ConfigurationSnapshot, "modelProviders" | "models">, reference: string | null): { model: ProviderModel; provider: ModelProvider } | null {
  const expression = reference === null ? null : parseModelExpression(reference);
  if (!expression) return null;
  const model = snapshot.models.find(item => item.providerId === expression.provider && item.modelId === expression.model);
  if (!model?.enabled) return null;
  const provider = snapshot.modelProviders.find(item => item.id === model.providerId);
  return provider?.enabled ? { model, provider } : null;
}

export { availableThinkingLevels } from "@asterism-app/sdk/contracts";
