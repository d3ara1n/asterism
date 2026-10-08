import { z } from "zod";

export const configurationChannel = "weft:configuration";
export const configurationChangedChannel = "weft:configuration-changed";
export const configurationVersion = 2;
const id = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(160);
const revision = z.number().int().positive();
export const protocolSchema = z.enum(["openai-responses", "openai-chat", "anthropic"]);
export const thinkingSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
export type ThinkingLevel = z.infer<typeof thinkingSchema>;
const endpoint = z.string().trim().url().refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Use an HTTP(S) base URL without credentials, query, or fragment.");
export const providerInputSchema = z.strictObject({
  name, protocol: protocolSchema, baseUrl: endpoint, enabled: z.boolean(), auth: z.enum(["api_key", "none"]),
});
export const credentialStateSchema = z.enum(["not_required", "missing", "available", "storage_unavailable", "decryption_failed"]);
export const providerSchema = providerInputSchema.extend({ id, revision, credentialState: credentialStateSchema });
export const modelInputSchema = z.strictObject({
  providerId: id, name, modelId: name, enabled: z.boolean(),
  contextWindow: z.number().int().positive().nullable(),
  capabilities: z.strictObject({ reasoning: z.boolean(), tools: z.boolean(), images: z.boolean() }),
  generation: z.strictObject({
    temperature: z.number().min(0).max(2).nullable(), topP: z.number().min(0).max(1).nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
  }),
});
export const modelSchema = modelInputSchema.extend({ id, revision });
export const modelRoleInputSchema = z.strictObject({
  name, modelId: id.nullable(), thinking: thinkingSchema.nullable(), enabled: z.boolean(), description: z.string().max(20_000), hidden: z.boolean(),
});
const configurationSourceSchema = z.strictObject({
  defaultsVersion: z.string(), baseId: id, overriddenFields: z.array(z.string()),
});
export const modelRoleSchema = modelRoleInputSchema.extend({ id, revision, builtin: z.boolean(), source: configurationSourceSchema.optional() });
const names = z.array(id).max(200);
const agentFieldsSchema = z.strictObject({
  name, enabled: z.boolean(), description: z.string().max(20_000), systemPrompt: z.string().max(100_000),
  modelRole: id.nullable(), fallbackRole: id.nullable(), examples: z.array(z.string().max(4_000)).max(50), decisionTrigger: z.string().max(4_000),
  tools: names.nullable(), excludeTools: names.nullable(), subagentRoles: names.nullable(),
  timeout: z.number().int().positive().max(86_400).nullable(), maxTurns: z.number().int().positive().nullable(), maxCost: z.number().positive().nullable(),
});
export const agentInputSchema = agentFieldsSchema.refine(value => value.tools === null || value.excludeTools === null, "Tool allowlist and denylist are mutually exclusive.");
export const agentSchema = agentInputSchema.safeExtend({ id, revision, builtin: z.boolean(), source: configurationSourceSchema.optional() });
// 留空文本在保存时移除覆盖；false、null 和空列表保留各自的业务含义。
const overrideName = z.string().trim().max(160).optional();
export const modelRoleOverridesSchema = modelRoleInputSchema.partial().extend({ name: overrideName });
export const agentOverridesSchema = agentFieldsSchema.partial().extend({ name: overrideName })
  .refine(value => value.tools == null || value.excludeTools == null, "Tool allowlist and denylist are mutually exclusive.");
export const testErrorSchema = z.enum(["configuration", "credential", "authentication", "model_unavailable", "rate_limit", "network", "timeout", "protocol", "server", "cancelled"]);
export const connectionTestSchema = z.strictObject({
  id, providerId: id, providerRevision: revision, modelId: id, modelRevision: revision,
  state: z.enum(["running", "succeeded", "failed", "cancelled"]), startedAt: z.string(),
  durationMs: z.number().nonnegative().nullable(), error: testErrorSchema.nullable(), message: z.string().nullable(),
});
export const configurationSnapshotSchema = z.strictObject({
  providers: z.array(providerSchema), models: z.array(modelSchema), roles: z.array(modelRoleSchema), agents: z.array(agentSchema),
  tests: z.array(connectionTestSchema), credentialStorageAvailable: z.boolean(),
  defaults: z.strictObject({
    version: z.string(), roles: z.record(id, modelRoleInputSchema), agents: z.record(id, agentInputSchema),
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
  z.strictObject({ type: z.literal("provider.save"), ...target, value: providerInputSchema, credential: credentialUpdateSchema }),
  z.strictObject({ type: z.literal("model.save"), ...target, value: modelInputSchema }),
  z.strictObject({ type: z.literal("role.save"), ...target, value: modelRoleOverridesSchema }),
  z.strictObject({ type: z.literal("agent.save"), ...target, value: agentOverridesSchema }),
  z.strictObject({ type: z.literal("remove"), kind: z.enum(["provider", "model", "role", "agent"]), id }),
  z.strictObject({ type: z.literal("test.start"), modelId: id }),
  z.strictObject({ type: z.literal("test.cancel"), id }),
]);
export const configurationErrorSchema = z.strictObject({
  code: z.enum(["invalid_request", "not_found", "conflict", "unavailable", "internal"]), message: z.string(),
});
export const configurationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), snapshot: configurationSnapshotSchema, savedId: id.nullable() }),
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
export function resolveProviderModel(snapshot: ConfigurationSnapshot, modelId: string | null): { model: ProviderModel; provider: Provider } | null {
  const model = snapshot.models.find(item => item.id === modelId);
  if (!model?.enabled) return null;
  const provider = snapshot.providers.find(item => item.id === model.providerId);
  return provider?.enabled ? { model, provider } : null;
}

/** 空值才继承；丢失、停用的配置必须由消费方显式处理，不能偷偷换成其他模型。 */
export function resolveModelRole(snapshot: ConfigurationSnapshot, roleId: string, current?: { modelId: string | null; thinking: ThinkingLevel | null }): {
  modelId: string | null; thinking: ThinkingLevel | null; error: "role_unavailable" | "model_unavailable" | null;
} {
  const role = snapshot.roles.find(item => item.id === roleId);
  if (!role?.enabled) return { modelId: null, thinking: null, error: "role_unavailable" };
  const modelId = role.modelId ?? current?.modelId ?? null;
  const thinking = role.thinking ?? current?.thinking ?? null;
  if (modelId === null) return { modelId, thinking, error: null };
  return { modelId, thinking, error: resolveProviderModel(snapshot, modelId) ? null : "model_unavailable" };
}
