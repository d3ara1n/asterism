import { defaultAgentPreset } from "@asterism-app/builtin-api/contracts";
import type { ParadigmConfiguration, ParadigmSnapshot } from "./contract.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";
import { defaultAgents, defaultRoles } from "./defaults.ts";

/** Stored entries contain user overrides and additions; the code owns built-in membership. */
export const defaultParadigmConfiguration: ParadigmConfiguration = {
  defaultAgentId: defaultAgentPreset,
  roles: [],
  agents: [],
};

function composeEntries<T extends object>(builtins: readonly { id: string }[], entries: readonly { id: string; builtin: boolean; overrides: T }[]) {
  const remaining = new Map(entries.map(entry => [entry.id, entry]));
  const inherited = builtins.map(({ id }) => {
    const stored = remaining.get(id);
    remaining.delete(id);
    return { id, builtin: true, overrides: stored?.overrides ?? {} };
  });
  return [...inherited, ...remaining.values()];
}

export function resolveParadigmConfiguration(value: ParadigmConfiguration): ParadigmSnapshot {
  return {
    defaultAgentId: value.defaultAgentId,
    roles: composeEntries(defaultRoles, value.roles).map(role => resolveRoleConfiguration(role)),
    agents: composeEntries(defaultAgents, value.agents).map(agent => resolveAgentConfiguration(agent)),
    defaults: structuredClone(configurationDefaults),
    overrides: {
      roles: Object.fromEntries(value.roles.map(role => [role.id, role.overrides])),
      agents: Object.fromEntries(value.agents.map(agent => [agent.id, agent.overrides])),
    },
  };
}
