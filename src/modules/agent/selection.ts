import { PluginApiError, type ObjectReader } from "@atelier/sdk/runtime";
import type { AgentSelection as Selection } from "../../shared/model.ts";
import type { AgentConfiguration } from "../../shared/configuration.ts";
import { AgentSelection } from "./contract.ts";

export function selectionOf(object: ObjectReader) {
  const value = object.get(AgentSelection);
  if (!value) throw new PluginApiError("not_found", "Agent not found.");
  return value;
}
/** 配置每次读取当前值，链接说明与请求使用同一份策略规则。 */
export function createSelection(deps: { agents(): readonly AgentConfiguration[] }) {
  const configurations = () => deps.agents().filter(agent => agent.enabled);
  const agentOf = (selection: Selection) => {
    const agent = configurations().find(value => value.id === selection.agent);
    if (!agent) throw new PluginApiError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
    return agent;
  };
  return {
    agent: agentOf,
    validate(selection: Selection, previous?: Selection): void {
      if (!configurations().some(agent => agent.id === selection.agent) && selection.agent !== previous?.agent)
        throw new PluginApiError("unavailable", "The selected agent configuration is unavailable.");
    },
    target(selection: Selection) {
      return { role: agentOf(selection).modelRole ?? "default", model: selection.model ?? undefined, thinking: selection.thinking ?? undefined };
    },
    tools(agent: AgentConfiguration) {
      return { ...(agent.tools === null ? {} : { allow: agent.tools }), ...(agent.excludeTools === null ? {} : { exclude: agent.excludeTools }) };
    },
  };
}
export type AgentSelectionService = ReturnType<typeof createSelection>;
