import { nanoid } from "nanoid";
import { SubmitAgentInput, CancelAgent, type AgentMessageSender, type SubmitAgentInputData, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { PluginApiError, type ObjectReader, type PluginContext, type ResourceRef, type ResourceActionOptions } from "@asterism-app/sdk/runtime";

/** Construct once and retain the complete input for any retry. Delivery mode is independent of source. */
export function userMessage(parts: AgentInputPart[], mode: SubmitAgentInputData["mode"]): SubmitAgentInputData {
  return { submissionId: nanoid(16), mode, parts, sender: { kind: "user" } };
}

/** Relay adapters supply the communication resource and the Agent's name on that resource. */
export function agentMessage(sender: Extract<AgentMessageSender, { kind: "agent" }>,
  parts: AgentInputPart[], mode: SubmitAgentInputData["mode"]): SubmitAgentInputData {
  return { submissionId: nanoid(16), mode, parts, sender };
}

/** Resource callbacks format facts as readable text and capture the source name when constructing the input. */
export function resourceEvent(source: ObjectReader, text: string, mode: SubmitAgentInputData["mode"]): SubmitAgentInputData {
  const resource = source.snapshot();
  if (!resource) throw new PluginApiError("not_found", "The event source is unavailable.");
  return {
    submissionId: nanoid(16), mode, parts: [{ kind: "text", text }],
    sender: { kind: "event", resource: { ...source.ref }, name: resource.title },
  };
}

/** All three sources use this action. Resolution confirms acceptance; the Agent executes independently. */
export async function submitMessage(plugin: PluginContext, agent: ResourceRef, input: SubmitAgentInputData,
  options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, input, options);
}

/** Cancelling submission and cancelling the Agent's independent execution are separate operations. */
export async function stopAgent(plugin: PluginContext, agent: ResourceRef) {
  await plugin.session(agent.sessionId).invoke(CancelAgent, agent, {});
}
