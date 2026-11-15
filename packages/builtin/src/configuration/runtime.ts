import type { ConfigurationOperation, ParadigmConfiguration } from "./contract.ts";
import { normalizeOverrides } from "./layers.ts";
import { parseModelExpression, resolveModelSelection, type ModelTarget, type ThinkingLevel } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginContext } from "@asterism-app/sdk/runtime";
import type { AgentConfiguration, ModelRole } from "@asterism-app/builtin-api/contracts";
import { BuiltinSettings, settingsMessages } from "../settings/contract.ts";
import { resolveParadigmConfiguration } from "./state.ts";

export function builtinConfiguration(plugin: PluginContext) { return resolveParadigmConfiguration(plugin.config(BuiltinSettings).get().paradigm); }
/** Model-created Agents and delegated tasks validate new role selections at admission. */
export function selectAgentForModel(agents: readonly AgentConfiguration[], id: string): AgentConfiguration {
  const agent = agents.find(agent => agent.id === id && agent.enabled && agent.availableToAgents);
  if (!agent) throw new PluginApiError("not_found", `Agent role ${id} is unavailable.`);
  return agent;
}
export function resolveRoleTarget(roles: readonly ModelRole[], roleId: string, overrides: { model?: string | null; thinking?: ThinkingLevel | null } = {}): ModelTarget {
  const role = roles.find(role => role.id === roleId && role.enabled);
  if (!role) throw new PluginApiError("unavailable", `Model role ${roleId} is unavailable.`, "role_unavailable");
  const { model, thinking } = resolveModelSelection(role, overrides);
  const target = model ? parseModelExpression(model) : null;
  if (!target) throw new PluginApiError("unavailable", `Model role ${roleId} has no configured model.`, "model_unavailable");
  return { ...target, ...(thinking === null ? {} : { thinking }) };
}

/** Apply one edit to the latest plugin configuration; saved references remain explicit when a target disappears. */
export function updateParadigmConfiguration(value: ParadigmConfiguration, command: ConfigurationOperation): ParadigmConfiguration {
  const next = structuredClone(value);
  if (command.type === "agent.default") {
    const agent = resolveParadigmConfiguration(value).agents.find(agent => agent.id === command.id && agent.enabled);
    if (!agent) throw new PluginApiError("unavailable", "The default Agent configuration is unavailable.", "agent_unavailable", settingsMessages.agentUnavailable);
    next.defaultAgentId = command.id;
    return next;
  }
  const kind = command.type === "remove" ? command.kind : command.type === "role.save" ? "role" : "agent";
  const collection = kind === "role" ? next.roles : next.agents;
  const effective = resolveParadigmConfiguration(value);
  const configurations = kind === "role" ? effective.roles : effective.agents;
  const current = command.id === null ? undefined : configurations.find(item => item.id === command.id);
  const index = command.id === null ? -1 : collection.findIndex(item => item.id === command.id);
  if (command.id !== null && !current) throw new PluginApiError("not_found", "This configuration no longer exists.", undefined, settingsMessages.missing);
  if (command.type === "remove") {
    if (current!.builtin) throw new PluginApiError("invalid_argument", "Built-in configurations cannot be deleted.", undefined, settingsMessages.builtinRemoval);
    collection.splice(index, 1);
  } else {
    if (current?.builtin && command.value.id !== command.id) throw new PluginApiError("invalid_argument", "Built-in configuration IDs are fixed.", undefined, settingsMessages.builtinId);
    if (configurations.some(item => item.id === command.value.id && item.id !== command.id)) throw new PluginApiError("conflict", "This configuration ID is already used.", undefined, settingsMessages.idTaken);
    const { id, ...overrides } = command.value;
    const entry = { id, builtin: current?.builtin ?? false, overrides: normalizeOverrides(overrides) };
    if (index < 0) collection.push(entry); else collection[index] = entry;
  }
  resolveParadigmConfiguration(next);
  return next;
}
