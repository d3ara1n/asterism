import { z } from "zod";
import { modelCostSchema, modelReference, resolveModelSelection, thinkingSchema } from "@atelier/sdk/contracts";
import { agentSchema, type AgentSelection } from "./configuration.ts";
import { builtin } from "./identity.ts";

/** 应用投影给内置插件的目录；不包含配置文件格式、凭据、连接测试或覆盖编辑状态。 */
export const AgentConfigurations = builtin.data("agent.configurations", z.array(agentSchema));
const providerSchema = z.object({ id: z.string(), name: z.string(), enabled: z.boolean() });
const modelSchema = z.object({
  providerId: z.string(), modelId: z.string(), name: z.string(), enabled: z.boolean(),
  contextWindow: z.number().nullable(), cost: modelCostSchema.nullable(),
  generation: z.object({ maxOutputTokens: z.number().nullable() }),
  capabilities: z.object({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
});
const roleSchema = z.object({ id: z.string(), enabled: z.boolean(), model: z.string().nullable(), thinking: thinkingSchema.nullable() });
export const ModelConfiguration = builtin.data("model.configuration", z.object({
  providers: z.array(providerSchema), models: z.array(modelSchema), roles: z.array(roleSchema), agents: z.array(agentSchema),
}));
export type ModelConfigurationSnapshot = z.infer<typeof ModelConfiguration.schema>;
export type CatalogModel = z.infer<typeof modelSchema>;

export function resolveCatalogModel<M extends CatalogModel>(snapshot: Omit<ModelConfigurationSnapshot, "models"> & { models: M[] }, reference: string | null): M | null {
  return snapshot.models.find(model => model.enabled && modelReference(model) === reference
    && snapshot.providers.some(provider => provider.id === model.providerId && provider.enabled)) ?? null;
}
export function resolveAgentModel<M extends CatalogModel>(snapshot: Omit<ModelConfigurationSnapshot, "models"> & { models: M[] }, selection: { agent: string | null; model: string | null }): M | null {
  return resolveAgentModelSelection(snapshot, { ...selection, thinking: null }).model;
}

/** 当前目录下的展示解析；保留原始覆盖与失效引用，请求仍独立取用其边界上的配置。 */
export function resolveAgentModelSelection<M extends CatalogModel>(
  snapshot: Omit<ModelConfigurationSnapshot, "models"> & { models: M[] },
  selection: Omit<AgentSelection, "agent"> & { agent: string | null },
) {
  const agent = snapshot.agents.find(item => item.id === selection.agent && item.enabled);
  const role = snapshot.roles.find(item => item.id === (agent?.modelRole ?? "default"));
  const resolved = resolveModelSelection(role, selection);
  return {
    reference: resolved.model,
    model: agent && role?.enabled ? resolveCatalogModel(snapshot, resolved.model) : null,
    thinking: resolved.thinking,
  };
}
