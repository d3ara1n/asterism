import {
  agentSchema, agentOverridesSchema, modelRoleSchema, modelRoleOverridesSchema,
  type AgentOverrides, type ModelRoleOverrides, type ConfigurationSnapshot,
} from "../shared/configuration.ts";
import { defaultAgents, defaultRoles } from "./defaults.ts";
import type { ConfigurationRow } from "./repository.ts";

export const configurationDefaults: ConfigurationSnapshot["defaults"] = {
  roles: Object.fromEntries(defaultRoles.map(({ id, builtin: _builtin, ...value }) => [id, value])),
  agents: Object.fromEntries(defaultAgents.map(({ id, builtin: _builtin, ...value }) => [id, value])),
};

export function normalizeOverrides<T extends ModelRoleOverrides | AgentOverrides>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) =>
    item !== undefined && !(typeof item === "string" && item.trim() === ""))) as T;
}

/** 新自定义项的名称由用户提供；只继承行为字段，不继承内置身份。 */
function baseId(row: Pick<ConfigurationRow, "id" | "builtin">, fallback: string): string {
  return row.builtin ? row.id : fallback;
}
export function resolveRoleConfiguration(row: ConfigurationRow, defaults = configurationDefaults) {
  const overrides = modelRoleOverridesSchema.parse(JSON.parse(row.data_json));
  const base = baseId(row, "default");
  const inherited = defaults.roles[base];
  if (!inherited) throw new Error("Built-in role definition is unavailable.");
  return modelRoleSchema.parse({
    ...inherited, ...overrides, name: overrides.name ?? (row.builtin ? inherited.name : row.id),
    id: row.id, revision: row.revision, builtin: !!row.builtin,
  });
}
export function resolveAgentConfiguration(row: ConfigurationRow, defaults = configurationDefaults) {
  const overrides = agentOverridesSchema.parse(JSON.parse(row.data_json));
  const base = baseId(row, "worker");
  const inherited = defaults.agents[base];
  if (!inherited) throw new Error("Built-in agent definition is unavailable.");
  // 允许/排除列表是一项互斥策略；覆盖其中一侧同时撤下内置的另一侧。
  const policy = overrides.tools !== undefined || overrides.excludeTools !== undefined
    ? { tools: overrides.tools ?? null, excludeTools: overrides.excludeTools ?? null } : {};
  return agentSchema.parse({
    ...inherited, ...overrides, ...policy, name: overrides.name ?? (row.builtin ? inherited.name : row.id),
    id: row.id, revision: row.revision, builtin: !!row.builtin,
  });
}
