import type { ParadigmSnapshot } from "./contract.ts";
import {
  agentSchema, agentOverridesSchema, modelRoleSchema, modelRoleOverridesSchema,
  type AgentOverrides, type ModelRoleOverrides,
} from "@asterism-app/builtin-api/contracts";
import { defaultAgents, defaultRoles, workerAgentId } from "./defaults.ts";

type ConfigurationIdentity = { id: string; builtin: boolean };
export type RoleConfigurationEntry = ConfigurationIdentity & { overrides: ModelRoleOverrides };
export type AgentConfigurationEntry = ConfigurationIdentity & { overrides: AgentOverrides };

export const configurationDefaults: ParadigmSnapshot["defaults"] = {
  roles: Object.fromEntries(defaultRoles.map(({ id, builtin: _builtin, ...value }) => [id, value])),
  agents: Object.fromEntries(defaultAgents.map(({ id, builtin: _builtin, ...value }) => [id, value])),
};

export function normalizeOverrides<T extends ModelRoleOverrides | AgentOverrides>(value: T): T {
  return normalizeFields(value) as T;
}

function normalizeFields(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]): [string, unknown][] => {
    if (item === undefined || (typeof item === "string" && item.trim() === "")) return [];
    // Nested settings override individually; an object without fields overrides nothing.
    if ((key === "subagent" || key === "budget") && item && typeof item === "object") {
      const fields = Object.entries(normalizeFields(item));
      return fields.length ? [[key, Object.fromEntries(fields)]] : [];
    }
    return [[key, item]];
  }));
}

/** Built-in entries inherit their own defaults; custom and new entries inherit only behavior fields from a fixed baseline, and users supply their identities. */
export const roleBaseId = (role?: ConfigurationIdentity) => role?.builtin ? role.id : "default";
export const agentBaseId = (agent?: ConfigurationIdentity) => agent?.builtin ? agent.id : workerAgentId;
export function resolveRoleConfiguration(role: RoleConfigurationEntry, defaults = configurationDefaults) {
  const overrides = modelRoleOverridesSchema.parse(role.overrides);
  const base = roleBaseId(role);
  const inherited = defaults.roles[base];
  if (!inherited) throw new Error("Built-in role definition is unavailable.");
  return modelRoleSchema.parse({
    ...inherited, ...overrides,
    id: role.id, builtin: role.builtin,
  });
}
export function resolveAgentConfiguration(agent: AgentConfigurationEntry, defaults = configurationDefaults) {
  const overrides = agentOverridesSchema.parse(agent.overrides);
  const base = agentBaseId(agent);
  const inherited = defaults.agents[base];
  if (!inherited) throw new Error("Built-in agent definition is unavailable.");
  // The two lists form one policy; overriding either clears the inherited opposite list.
  const policy = overrides.resources !== undefined || overrides.excludeResources !== undefined
    ? { resources: overrides.resources ?? null, excludeResources: overrides.excludeResources ?? null } : {};
  return agentSchema.parse({
    ...inherited, ...overrides, ...policy,
    subagent: { ...inherited.subagent, ...overrides.subagent,
      budget: { ...inherited.subagent.budget, ...overrides.subagent?.budget } },
    id: agent.id, builtin: agent.builtin,
  });
}
