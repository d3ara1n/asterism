import { agentInputSchema, agentSchema, agentOverridesSchema, configurationIdSchema } from "@atelier/builtin-api/contracts";
export { agentInputSchema, agentSchema, agentOverridesSchema, type AgentConfiguration, type AgentOverrides } from "@atelier/builtin-api/contracts";
import {
  modelExpressionSchema, parseModelExpression, thinkingSchema, type ThinkingLevel,
  thinkingLevels, modelCostSchema, uiTextSchema,
  modelProviderFixedFields, providerUsageIdSchema, usageProviderInfoSchema, modelProviderPresetSchema,
} from "@atelier/sdk/contracts";
export { modelExpressionSchema, parseModelExpression, formatModelExpression, modelReference, thinkingSchema, type ModelExpression, type ThinkingLevel } from "@atelier/sdk/contracts";
import { z } from "zod";
import { webProviderStateSchema, webProviderTypeSchema } from "@atelier/sdk/contracts";
import { modelCompatibilitySchema } from "./model-compatibility.ts";

const id = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(160);
/** 提供商 ID：程序与用户共用的可读 slug，可编辑，不含 `/` 与空白。 */
export const modelProviderIdSchema = z.string().trim().min(1).max(160).regex(/^[^/\s]+$/u, "ModelProvider IDs cannot contain '/' or whitespace.");
/** 服务端模型 ID：全局共识的模型名，可含 `/`，不含空白。 */
const serverModelId = z.string().trim().min(1).max(160).regex(/^\S+$/u, "Model IDs cannot contain whitespace.");
export const protocolSchema = z.enum(["openai-responses", "openai-chat", "anthropic"]);
/** 连接可固定的配置项；认证方式不包含凭据，兼容设置同时约束模型编辑。 */
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
  // 只保留改变请求内容的能力；文件是否被接受由服务端决定。
  capabilities: z.strictObject({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
  generation: z.strictObject({
    temperature: z.number().min(0).max(2).nullable(), topP: z.number().min(0).max(1).nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
  }),
  compatibility: modelCompatibilitySchema,
});
export const modelSchema = modelInputSchema;
export const modelRoleInputSchema = z.strictObject({
  model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable(), enabled: z.boolean(), description: z.string().max(20_000), hidden: z.boolean(),
});
export const modelRoleSchema = modelRoleInputSchema.extend({ id: configurationIdSchema, builtin: z.boolean() });
export const modelRoleOverridesSchema = modelRoleInputSchema.partial();
export const testErrorSchema = z.enum(["configuration", "credential", "authentication", "model_unavailable", "rate_limit", "network", "timeout", "protocol", "server", "cancelled"]);
export const connectionTestSchema = z.strictObject({
  id, providerId: modelProviderIdSchema, model: modelExpressionSchema,
  state: z.enum(["running", "succeeded", "failed", "cancelled"]), startedAt: z.string(),
  durationMs: z.number().nonnegative().nullable(), error: testErrorSchema.nullable(), message: z.string().nullable(),
});
/** 发现只保存端点明确声明的资料；缺失字段不代表不支持。 */
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
/** 手动新建与发现添加共用初始值；只用已知资料覆盖默认值。 */
export function createModelInput(providerId: string, model: DiscoveredModel): z.infer<typeof modelInputSchema> {
  return {
    providerId, modelId: model.modelId, name: model.name, enabled: true,
    contextWindow: model.contextWindow ?? null, cost: null, compatibility: [],
    capabilities: { reasoning: model.reasoning ?? true, tools: true, thinkingLevels: model.thinkingLevels ?? [...thinkingLevels] },
    generation: { temperature: null, topP: null, maxOutputTokens: null },
  };
}
export const configurationSnapshotSchema = z.strictObject({
  webProviders: z.array(webProviderSchema),
  webProviderTypes: z.array(webProviderTypeSchema),
  modelProviders: z.array(modelProviderSchema), models: z.array(modelSchema), roles: z.array(modelRoleSchema), agents: z.array(agentSchema),
  tests: z.array(connectionTestSchema), discoveries: z.array(modelDiscoverySchema), credentialStorageAvailable: z.boolean(),
  modelProviderPresets: z.array(modelProviderPresetSchema).optional(),
  usageProviders: z.array(usageProviderInfoSchema).optional(),
  defaults: z.strictObject({
    roles: z.record(id, modelRoleInputSchema), agents: z.record(id, agentInputSchema),
  }),
  overrides: z.strictObject({
    roles: z.record(id, modelRoleOverridesSchema), agents: z.record(id, agentOverridesSchema),
  }),
});
const target = { id: id.nullable() };
const credentialUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("keep") }), z.strictObject({ action: z.literal("clear") }),
  z.strictObject({ action: z.literal("replace"), value: z.string().trim().min(1).max(16_384) }),
]);
export const configurationCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("webProvider.save"), id: z.string().trim().min(1), enabled: z.boolean(), credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("read") }),
  // 保存目标是当前 ID；value 中的 ID 可以不同，即改名。
  z.strictObject({ type: z.literal("modelProvider.save"), id: modelProviderIdSchema.nullable(), value: modelProviderInputSchema, credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("model.save"), id: modelExpressionSchema.nullable(), value: modelInputSchema }),
  z.strictObject({ type: z.literal("role.save"), ...target, value: modelRoleOverridesSchema.extend({ id: configurationIdSchema }) }),
  z.strictObject({ type: z.literal("agent.save"), ...target, value: agentOverridesSchema.safeExtend({ id: configurationIdSchema }) }),
  z.strictObject({ type: z.literal("remove"), kind: z.enum(["modelProvider", "webProvider", "model", "role", "agent"]), id: z.string().min(1).max(321) }),
  z.strictObject({ type: z.literal("test.start"), model: modelExpressionSchema }),
  z.strictObject({ type: z.literal("test.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.start"), providerId: modelProviderIdSchema }),
  z.strictObject({ type: z.literal("discovery.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.add"), id, modelIds: z.array(serverModelId).min(1) }),
  z.strictObject({ type: z.literal("model.parameters"), model: modelExpressionSchema }),
]);
export const modelParameterUpdateSchema = z.strictObject({
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
/** 缺少编辑规则的连接保持自由配置，不按名称、端点或目录反推来源。 */
export function canEditModelProviderField(provider: Pick<ModelProviderInput, "fixedFields">, field: ModelProviderFixedField): boolean {
  return !provider.fixedFields?.includes(field);
}
export type ProviderModel = z.infer<typeof modelSchema>;
export type ModelRole = z.infer<typeof modelRoleSchema>;
export type ModelRoleOverrides = z.infer<typeof modelRoleOverridesSchema>;
export type ConfigurationSnapshot = z.infer<typeof configurationSnapshotSchema>;
export type ConfigurationCommand = z.infer<typeof configurationCommandSchema>;
export type ConfigurationResult = z.infer<typeof configurationResultSchema>;
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
export type TestError = z.infer<typeof testErrorSchema>;
export interface ConfigurationBridge {
  execute(command: ConfigurationCommand): Promise<ConfigurationResult>;
  onChanged(listener: () => void): () => void;
}

/** 选择器和执行消费共用这一存在性/启用检查，不维护配置引用或级联状态。 */
export function resolveProviderModel(snapshot: ConfigurationSnapshot, reference: string | null): { model: ProviderModel; provider: ModelProvider } | null {
  const expression = reference === null ? null : parseModelExpression(reference);
  if (!expression) return null;
  const model = snapshot.models.find(item => item.providerId === expression.provider && item.modelId === expression.model);
  if (!model?.enabled) return null;
  const provider = snapshot.modelProviders.find(item => item.id === model.providerId);
  return provider?.enabled ? { model, provider } : null;
}

export { resolveAgentModel } from "@atelier/builtin-api/contracts";
export { availableThinkingLevels } from "@atelier/sdk/contracts";

/**
 * 空值才继承；丢失、停用的配置必须由消费方显式处理，不能偷偷换成其他模型。
 * 隐藏角色只对代理不开放：代理路径使用默认值，内部功能显式传 allowHidden。
 */
export function resolveModelRole(snapshot: ConfigurationSnapshot, roleId: string, current?: { model: string | null; thinking: ThinkingLevel | null }, options: { allowHidden?: boolean } = {}): {
  model: string | null; thinking: ThinkingLevel | null; error: "role_unavailable" | "model_unavailable" | null;
} {
  const role = snapshot.roles.find(item => item.id === roleId);
  if (!role?.enabled || (role.hidden && !options.allowHidden)) return { model: null, thinking: null, error: "role_unavailable" };
  const model = role.model ?? current?.model ?? null;
  const thinking = role.thinking ?? current?.thinking ?? null;
  if (model === null) return { model, thinking, error: null };
  return { model, thinking, error: resolveProviderModel(snapshot, model) ? null : "model_unavailable" };
}
