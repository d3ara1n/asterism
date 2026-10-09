import { implementResource } from "../../resources/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { Agent, AgentView } from "./contract.ts";

export default (() => ({
  resources: [implementResource(Agent, AgentView, {
    project: (_state, resource) => ({ agentId: resource.id }),
    async inspect(_state, resource) { return { type: Agent.kind, title: resource.title }; },
  })],
  tools: [],
})) satisfies RuntimeModuleFactory;
