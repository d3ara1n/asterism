import { z } from "zod";
import { modelCostSchema, modelReference, thinkingSchema } from "@atelier/sdk/contracts";
import { agentSchema } from "./configuration.ts";
import { builtin } from "./identity.ts";

/** 应用投影给内置插件的目录；不包含配置文件格式、凭据、连接测试或覆盖编辑状态。 */
export const AgentConfigurations = builtin.data("agent.configurations", z.array(agentSchema));
const providerSchema = z.object({ id: z.string(), name: z.string(), enabled: z.boolean() });
const modelSchema = z.object({
  providerId: z.string(), modelId: z.string(), name: z.string(), enabled: z.boolean(),
  contextWindow: z.number().nullable(), cost: modelCostSchema.nullable(),
  capabilities: z.object({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
});
const roleSchema = z.object({ id: z.string(), model: z.string().nullable(), thinking: thinkingSchema.nullable() });
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
  const agent = snapshot.agents.find(item => item.id === selection.agent);
  const role = snapshot.roles.find(item => item.id === (agent?.modelRole ?? "default"));
  return resolveCatalogModel(snapshot, selection.model ?? role?.model ?? null);
}
