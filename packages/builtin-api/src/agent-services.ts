import type { ResourceRef, SessionDirectory } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginContext } from "@asterism-app/sdk/runtime";
import type { PeekClient } from "./peek.ts";

/** Agent-owned operations for trusted plugins that have resolved an authorized resource reference. */
export interface AgentServices {
  describe(target: ResourceRef): { type: string };
  peek(target: ResourceRef): PeekClient;
}
const services = new WeakMap<SessionDirectory, AgentServices>();

export function registerAgentServices(plugin: PluginContext, value: AgentServices): void {
  if (services.has(plugin.sessions)) throw new PluginApiError("conflict", "Agent services are already registered.");
  services.set(plugin.sessions, value);
  plugin.lifetime.signal.addEventListener("abort", () => services.delete(plugin.sessions), { once: true });
}

export function agentServices(plugin: PluginContext): AgentServices {
  plugin.lifetime.signal.throwIfAborted();
  const value = services.get(plugin.sessions);
  if (!value) throw new PluginApiError("unavailable", "Agent services are unavailable.");
  return value;
}
