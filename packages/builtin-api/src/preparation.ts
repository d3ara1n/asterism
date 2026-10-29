import type { SessionDirectory } from "@asterism-app/sdk/contracts";
import { defineModule, PluginApiError, type AgentSkill, type PluginContext } from "@asterism-app/sdk/runtime";

import type { AgentPromptBlock } from "./prompt.ts";
export type { AgentPromptBlock } from "./prompt.ts";
export interface AgentPreparation {
  skills: readonly AgentSkill[];
  blocks: AgentPromptBlock[];
}
interface Preparer { id: string; prepare(value: AgentPreparation): void }
const directories = new WeakMap<SessionDirectory, Map<string, Preparer>>();
function entries(plugin: PluginContext) {
  let value = directories.get(plugin.sessions);
  if (!value) { value = new Map(); directories.set(plugin.sessions, value); }
  return value;
}
/** Synchronous pure transformations run in plugin initialization order and retain entry provenance. */
export function defineAgentPreparer(definition: Preparer) {
  return defineModule(plugin => {
    const registry = entries(plugin), id = `${plugin.id}:${definition.id}`;
    if (!definition.id.trim() || registry.has(id)) throw new PluginApiError("conflict", `Duplicate or empty Agent preparer: ${id}`);
    registry.set(id, definition);
    plugin.lifetime.signal.addEventListener("abort", () => registry.delete(id), { once: true });
    return {};
  });
}
export function captureAgentPreparers(plugin: PluginContext) {
  const preparers = [...entries(plugin).values()];
  return (value: AgentPreparation): AgentPreparation => {
    for (const preparer of preparers) preparer.prepare(value);
    return value;
  };
}
