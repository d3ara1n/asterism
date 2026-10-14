import { z } from "zod";
import { coreChannel } from "./core.ts";
import { thinkingLevels } from "@atelier/sdk/contracts";
import { modelCompatibilitySchema } from "./model-compatibility.ts";

export const configurationChannel = coreChannel("configuration");
export const configurationChangedChannel = coreChannel("configuration-changed");
export const configurationVersion = 8;
const id = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(160);
const revision = z.number().int().positive();
/** 提供商 ID：程序与用户共用的可读 slug，可编辑，不含 `/` 与空白。 */
export const providerIdSchema = z.string().trim().min(1).max(160).regex(/^[^/\s]+$/u, "Provider IDs cannot contain '/' or whitespace.");
/** 服务端模型 ID：全局共识的模型名，可含 `/`，不含空白。 */
const serverModelId = z.string().trim().min(1).max(160).regex(/^\S+$/u, "Model IDs cannot contain whitespace.");
/** 模型表达式 `<providerId>/<modelId>`：提供商与模型必定成对，按第一个 `/` 切分。 */
export interface ModelExpression { provider: string; model: string }
export function parseModelExpression(value: string): ModelExpression | null {
  const index = value.indexOf("/");
  if (index <= 0 || index === value.length - 1) return null;
  return { provider: value.slice(0, index), model: value.slice(index + 1) };
}
export function formatModelExpression(expression: ModelExpression): string { return `${expression.provider}/${expression.model}`; }
export const modelExpressionSchema = z.string().max(321).refine(value => parseModelExpression(value) !== null, "Use a model expression such as provider/model.");
/** 具体模型的引用串；与模型记录一一对应，不使用随机记录 ID。 */
export function modelReference(model: { providerId: string; modelId: string }): string {
  return formatModelExpression({ provider: model.providerId, model: model.modelId });
}
export const protocolSchema = z.enum(["openai-responses", "openai-chat", "anthropic"]);
export const thinkingSchema = z.enum(thinkingLevels);
export type ThinkingLevel = z.infer<typeof thinkingSchema>;
const endpoint = z.string().trim().url().refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Use an HTTP(S) base URL without credentials, query, or fragment.");
export const providerInputSchema = z.strictObject({
  id: providerIdSchema, name, protocol: protocolSchema, baseUrl: endpoint, enabled: z.boolean(), auth: z.enum(["api_key", "none"]),
  compatibility: modelCompatibilitySchema,
});
export const credentialStateSchema = z.enum(["not_required", "missing", "available", "storage_unavailable", "decryption_failed"]);
export const providerSchema = providerInputSchema.extend({ revision, credentialState: credentialStateSchema });
export const modelInputSchema = z.strictObject({
  providerId: providerIdSchema, name, modelId: serverModelId, enabled: z.boolean(),
  contextWindow: z.number().int().positive().nullable(),
  // 只保留改变请求内容的能力；文件是否被接受由服务端决定。
  capabilities: z.strictObject({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
  generation: z.strictObject({
    temperature: z.number().min(0).max(2).nullable(), topP: z.number().min(0).max(1).nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
  }),
  compatibility: modelCompatibilitySchema,
});
export const modelSchema = modelInputSchema.extend({ revision });
export const modelRoleInputSchema = z.strictObject({
  name, model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable(), enabled: z.boolean(), description: z.string().max(20_000), hidden: z.boolean(),
});
export const modelRoleSchema = modelRoleInputSchema.extend({ id, revision, builtin: z.boolean() });
const names = z.array(id).max(200);
const agentFieldsSchema = z.strictObject({
  name, enabled: z.boolean(), description: z.string().max(20_000), systemPrompt: z.string().max(100_000),
  modelRole: id.nullable(), fallbackRole: id.nullable(), examples: z.array(z.string().max(4_000)).max(50), decisionTrigger: z.string().max(4_000),
  tools: names.nullable(), excludeTools: names.nullable(), subagentRoles: names.nullable(),
  timeout: z.number().int().positive().max(86_400).nullable(), maxTurns: z.number().int().positive().nullable(),
});
export const agentInputSchema = agentFieldsSchema.refine(value => value.tools === null || value.excludeTools === null, "Tool allowlist and denylist are mutually exclusive.");
export const agentSchema = agentInputSchema.safeExtend({ id, revision, builtin: z.boolean() });
// 留空文本在保存时移除覆盖；false、null 和空列表保留各自的业务含义。
const overrideName = z.string().trim().max(160).optional();
export const modelRoleOverridesSchema = modelRoleInputSchema.partial().extend({ name: overrideName });
export const agentOverridesSchema = agentFieldsSchema.partial().extend({ name: overrideName })
  .refine(value => value.tools == null || value.excludeTools == null, "Tool allowlist and denylist are mutually exclusive.");
export const testErrorSchema = z.enum(["configuration", "credential", "authentication", "model_unavailable", "rate_limit", "network", "timeout", "protocol", "server", "cancelled"]);
export const connectionTestSchema = z.strictObject({
  id, providerId: providerIdSchema, providerRevision: revision, model: modelExpressionSchema, modelRevision: revision,
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
  id, providerId: providerIdSchema, providerRevision: revision,
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
    contextWindow: model.contextWindow ?? null, compatibility: [],
    capabilities: { reasoning: model.reasoning ?? true, tools: true, thinkingLevels: model.thinkingLevels ?? [...thinkingLevels] },
    generation: { temperature: null, topP: null, maxOutputTokens: null },
  };
}
export const configurationSnapshotSchema = z.strictObject({
  providers: z.array(providerSchema), models: z.array(modelSchema), roles: z.array(modelRoleSchema), agents: z.array(agentSchema),
  tests: z.array(connectionTestSchema), discoveries: z.array(modelDiscoverySchema), credentialStorageAvailable: z.boolean(),
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
  z.strictObject({ type: z.literal("read") }),
  // 保存目标是当前 ID；value 中的 ID 可以不同，即改名。
  z.strictObject({ type: z.literal("provider.save"), id: providerIdSchema.nullable(), value: providerInputSchema, credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("model.save"), id: modelExpressionSchema.nullable(), value: modelInputSchema }),
  z.strictObject({ type: z.literal("role.save"), ...target, value: modelRoleOverridesSchema }),
  z.strictObject({ type: z.literal("agent.save"), ...target, value: agentOverridesSchema }),
  z.strictObject({ type: z.literal("remove"), kind: z.enum(["provider", "model", "role", "agent"]), id: z.string().min(1).max(321) }),
  z.strictObject({ type: z.literal("test.start"), model: modelExpressionSchema }),
  z.strictObject({ type: z.literal("test.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.start"), providerId: providerIdSchema }),
  z.strictObject({ type: z.literal("discovery.cancel"), id }),
  z.strictObject({ type: z.literal("discovery.add"), id, modelIds: z.array(serverModelId).min(1) }),
  z.strictObject({ type: z.literal("model.parameters"), model: modelExpressionSchema }),
]);
export const modelParameterUpdateSchema = z.strictObject({
  source: z.string(),
  unfilled: z.array(z.enum(["contextWindow", "maxOutputTokens", "reasoning", "tools", "thinkingLevels"])),
});
export type ModelParameterUpdate = z.infer<typeof modelParameterUpdateSchema>;
export const configurationErrorSchema = z.strictObject({
  code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]), message: z.string(), display: uiTextSchema.optional(),
});
export const configurationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: configurationSnapshotSchema, savedId: z.string().max(321).nullable(), parameterUpdate: modelParameterUpdateSchema.optional() }),
  z.strictObject({ ok: z.literal(false), error: configurationErrorSchema }),
]);
export const configurationRequestSchema = z.strictObject({ kind: z.literal("configuration.request"), version: z.literal(configurationVersion), id: z.string().uuid(), command: configurationCommandSchema });
export const configurationResponseSchema = z.strictObject({ kind: z.literal("configuration.response"), version: z.literal(configurationVersion), id: z.string().uuid(), result: configurationResultSchema });
export const configurationChangedSchema = z.strictObject({ kind: z.literal("configuration.changed") });
export type Provider = z.infer<typeof providerSchema>;
export type ProviderInput = z.infer<typeof providerInputSchema>;
export type ProviderModel = z.infer<typeof modelSchema>;
export type ModelRole = z.infer<typeof modelRoleSchema>;
export type AgentConfiguration = z.infer<typeof agentSchema>;
export type ModelRoleOverrides = z.infer<typeof modelRoleOverridesSchema>;
export type AgentOverrides = z.infer<typeof agentOverridesSchema>;
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
export function resolveProviderModel(snapshot: ConfigurationSnapshot, reference: string | null): { model: ProviderModel; provider: Provider } | null {
  const expression = reference === null ? null : parseModelExpression(reference);
  if (!expression) return null;
  const model = snapshot.models.find(item => item.providerId === expression.provider && item.modelId === expression.model);
  if (!model?.enabled) return null;
  const provider = snapshot.providers.find(item => item.id === model.providerId);
  return provider?.enabled ? { model, provider } : null;
}

/** 只投影菜单能力，不把角色默认值写回代理选择，也不提前拒绝未解析的选择。 */
export function resolveAgentModel(snapshot: ConfigurationSnapshot, selection: { agent: string | null; model: string | null }): ProviderModel | null {
  const agent = snapshot.agents.find(item => item.id === selection.agent);
  const role = snapshot.roles.find(item => item.id === (agent?.modelRole ?? "default"));
  return resolveProviderModel(snapshot, selection.model ?? role?.model ?? null)?.model ?? null;
}

/** 未确定模型时保留标准选项，最终可用性由请求适配层检查。 */
export function availableThinkingLevels(model: Pick<ProviderModel, "capabilities"> | null): readonly ThinkingLevel[] {
  if (!model) return thinkingLevels;
  return model.capabilities.reasoning ? thinkingLevels.filter(level => model.capabilities.thinkingLevels.includes(level)) : [];
}

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
import { uiTextSchema } from "@atelier/sdk/contracts";
