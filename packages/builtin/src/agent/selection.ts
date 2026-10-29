import { AgentSelection } from "./data.ts";
import { PluginApiError, type ObjectReader } from "@asterism-app/sdk/runtime";
import type { AgentSelection as Selection, AgentConfiguration, ModelRole } from "@asterism-app/builtin-api/contracts";
import { resolveRoleTarget } from "../configuration/runtime.ts";


export function selectionOf(object: ObjectReader) {
  const value = object.get(AgentSelection);
  if (!value) throw new PluginApiError("not_found", "Agent not found.");
  return value;
}
/** Configuration reads always use current values; link descriptions and requests use the same policy rules. */
export function createSelection(deps: { agents(): readonly AgentConfiguration[]; roles(): readonly ModelRole[] }) {
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
      return resolveRoleTarget(deps.roles(), agentOf(selection).modelRole ?? "default", selection);
    },
    tools(agent: AgentConfiguration) {
      return { ...(agent.tools === null ? {} : { allow: agent.tools }), ...(agent.excludeTools === null ? {} : { exclude: agent.excludeTools }) };
    },
  };
}
export type AgentSelectionService = ReturnType<typeof createSelection>;
