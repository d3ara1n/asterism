import { nanoid } from "nanoid";
import { SubmitAgentInput, CancelAgent, type AgentMessageSender } from "@asterism/builtin-api/contracts";
import type { ModelInputPart } from "@asterism/sdk/contracts";
import type { PluginContext, ResourceRef, ResourceActionOptions } from "@asterism/sdk/runtime";

/** Backend plugins submit complete input using a resource reference; returning means acceptance, while the Agent maintains its own execution state. */
export async function steerAgent(plugin: PluginContext, agent: ResourceRef, parts: ModelInputPart[], options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, {
    submissionId: nanoid(16), mode: "steer", parts,
  }, options);
}

/** Relay adapters provide their own resource address and the agent name on that resource, leaving the body unchanged. */
export async function deliverAgentMessage(plugin: PluginContext, agent: ResourceRef,
  sender: Extract<AgentMessageSender, { kind: "agent" }>, parts: ModelInputPart[], options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, {
    submissionId: nanoid(16), mode: "steer", sender, parts,
  }, options);
}

/** The Agent's independent execution is canceled through a resource action, separately from cancellation of the submission request itself. */
export async function stopAgent(plugin: PluginContext, agent: ResourceRef) {
  await plugin.session(agent.sessionId).invoke(CancelAgent, agent, {});
}
