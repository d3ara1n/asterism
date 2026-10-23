import {
  agentSchema, agentOverridesSchema, modelRoleSchema, modelRoleOverridesSchema,
  type AgentOverrides, type ModelRoleOverrides, type ConfigurationSnapshot,
} from "../shared/configuration.ts";
import { defaultAgents, defaultRoles } from "./defaults.ts";

type ConfigurationIdentity = { id: string; builtin: boolean };
export type RoleConfigurationEntry = ConfigurationIdentity & { overrides: ModelRoleOverrides };
export type AgentConfigurationEntry = ConfigurationIdentity & { overrides: AgentOverrides };

export const configurationDefaults: ConfigurationSnapshot["defaults"] = {
  roles: Object.fromEntries(defaultRoles.map(({ id, builtin: _builtin, ...value }) => [id, value])),
  agents: Object.fromEntries(defaultAgents.map(({ id, builtin: _builtin, ...value }) => [id, value])),
};

export function normalizeOverrides<T extends ModelRoleOverrides | AgentOverrides>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) =>
    item !== undefined && !(typeof item === "string" && item.trim() === ""))) as T;
}

/** 自定义项只继承行为字段，身份由用户提供。 */
function baseId(item: { id: string; builtin: boolean }, fallback: string): string {
  return item.builtin ? item.id : fallback;
}
export function resolveRoleConfiguration(role: RoleConfigurationEntry, defaults = configurationDefaults) {
  const overrides = modelRoleOverridesSchema.parse(role.overrides);
  const base = baseId(role, "default");
  const inherited = defaults.roles[base];
  if (!inherited) throw new Error("Built-in role definition is unavailable.");
  return modelRoleSchema.parse({
    ...inherited, ...overrides,
    id: role.id, builtin: role.builtin,
  });
}
export function resolveAgentConfiguration(agent: AgentConfigurationEntry, defaults = configurationDefaults) {
  const overrides = agentOverridesSchema.parse(agent.overrides);
  const base = baseId(agent, "worker");
  const inherited = defaults.agents[base];
  if (!inherited) throw new Error("Built-in agent definition is unavailable.");
  // 允许/排除列表是一项互斥策略；覆盖其中一侧同时撤下内置的另一侧。
  const policy = overrides.tools !== undefined || overrides.excludeTools !== undefined
    ? { tools: overrides.tools ?? null, excludeTools: overrides.excludeTools ?? null } : {};
  return agentSchema.parse({
    ...inherited, ...overrides, ...policy,
    id: agent.id, builtin: agent.builtin,
  });
}
