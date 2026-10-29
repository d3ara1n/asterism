import { modelReference, resolveModelSelection, type CatalogModel, type ModelCatalogSnapshot } from "@asterism-app/sdk/contracts";
import type { AgentConfiguration, AgentSelection, ModelRole } from "./configuration.ts";

/** Builtin combines host model metadata with its own effective configuration. */
export interface ModelConfigurationSnapshot extends ModelCatalogSnapshot {
  roles: Pick<ModelRole, "id" | "enabled" | "model" | "thinking">[];
  agents: AgentConfiguration[];
}
export type { CatalogModel } from "@asterism-app/sdk/contracts";

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
