import type { ParadigmConfiguration, ParadigmSnapshot } from "./contract.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";
import { defaultAgents, defaultRoles } from "./defaults.ts";

export const defaultParadigmConfiguration: ParadigmConfiguration = {
  roles: defaultRoles.map(({ id, builtin }) => ({ id, builtin, overrides: {} })),
  agents: defaultAgents.map(({ id, builtin }) => ({ id, builtin, overrides: {} })),
};
export function resolveParadigmConfiguration(value: ParadigmConfiguration): ParadigmSnapshot {
  return { roles: value.roles.map(role => resolveRoleConfiguration(role)), agents: value.agents.map(agent => resolveAgentConfiguration(agent)),
    defaults: structuredClone(configurationDefaults), overrides: {
      roles: Object.fromEntries(value.roles.map(role => [role.id, role.overrides])),
      agents: Object.fromEntries(value.agents.map(agent => [agent.id, agent.overrides])),
    } };
}
