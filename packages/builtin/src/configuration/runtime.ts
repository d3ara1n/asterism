import type { ConfigurationOperation, ParadigmConfiguration } from "./contract.ts";
import { normalizeOverrides } from "./layers.ts";
import { parseModelExpression, resolveModelSelection, type ModelTarget, type ThinkingLevel } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginContext } from "@asterism-app/sdk/runtime";
import type { ModelRole } from "@asterism-app/builtin-api/contracts";
import { BuiltinSettings, settingsMessages } from "../settings/contract.ts";
import { resolveParadigmConfiguration } from "./state.ts";

export function builtinConfiguration(plugin: PluginContext) { return resolveParadigmConfiguration(plugin.config(BuiltinSettings).get().paradigm); }
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
  const kind = command.type === "remove" ? command.kind : command.type === "role.save" ? "role" : "agent";
  const collection = kind === "role" ? next.roles : next.agents;
  const index = command.id === null ? -1 : collection.findIndex(item => item.id === command.id);
  if (command.id !== null && index < 0) throw new PluginApiError("not_found", "This configuration no longer exists.", undefined, settingsMessages.missing);
  if (command.type === "remove") {
    if (index < 0) throw new PluginApiError("not_found", "This configuration no longer exists.", undefined, settingsMessages.missing);
    if (kind === "role" && collection[index]!.builtin) throw new PluginApiError("invalid_argument", "Built-in model roles cannot be deleted.", undefined, settingsMessages.builtinRole);
    collection.splice(index, 1);
  } else {
    if (collection.some((entry, current) => current !== index && entry.id === command.value.id)) throw new PluginApiError("conflict", "This configuration ID is already used.", undefined, settingsMessages.idTaken);
    const builtin = index >= 0 && collection[index]!.builtin;
    if (builtin && command.value.id !== command.id) throw new PluginApiError("invalid_argument", "Built-in configuration IDs are fixed.", undefined, settingsMessages.builtinId);
    const { id, ...overrides } = command.value;
    const entry = { id, builtin, overrides: normalizeOverrides(overrides) };
    if (index < 0) collection.push(entry); else collection[index] = entry;
  }
  resolveParadigmConfiguration(next);
  return next;
}
