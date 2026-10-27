import { z } from "zod";
import { modelCostSchema, modelReference, resolveModelSelection, thinkingSchema } from "@asterism-app/sdk/contracts";
import { agentSchema, type AgentSelection } from "./configuration.ts";
import { builtin } from "./identity.ts";

/** Catalogs projected by the application for built-in plugins; excludes configuration file formats, credentials, connection tests, and override editing state. */
export const AgentConfigurations = builtin.data("agent.configurations", z.array(agentSchema));
const modelProviderSchema = z.object({ id: z.string(), name: z.string(), enabled: z.boolean() });
const modelSchema = z.object({
  providerId: z.string(), modelId: z.string(), name: z.string(), enabled: z.boolean(),
  contextWindow: z.number().nullable(), cost: modelCostSchema.nullable(),
  generation: z.object({ maxOutputTokens: z.number().nullable() }),
  capabilities: z.object({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
});
const roleSchema = z.object({ id: z.string(), enabled: z.boolean(), model: z.string().nullable(), thinking: thinkingSchema.nullable() });
export const ModelConfiguration = builtin.data("model.configuration", z.object({
  modelProviders: z.array(modelProviderSchema), models: z.array(modelSchema), roles: z.array(roleSchema), agents: z.array(agentSchema),
}));
export type ModelConfigurationSnapshot = z.infer<typeof ModelConfiguration.schema>;
export type CatalogModel = z.infer<typeof modelSchema>;

export function resolveCatalogModel<M extends CatalogModel>(snapshot: Omit<ModelConfigurationSnapshot, "models"> & { models: M[] }, reference: string | null): M | null {
  return snapshot.models.find(model => model.enabled && modelReference(model) === reference
    && snapshot.modelProviders.some(provider => provider.id === model.providerId && provider.enabled)) ?? null;
}
export function resolveAgentModel<M extends CatalogModel>(snapshot: Omit<ModelConfigurationSnapshot, "models"> & { models: M[] }, selection: { agent: string | null; model: string | null }): M | null {
  return resolveAgentModelSelection(snapshot, { ...selection, thinking: null }).model;
}

/** Display resolution against the current catalogs; preserves raw overrides and invalid references, while requests independently use the configuration at their boundaries. */
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
