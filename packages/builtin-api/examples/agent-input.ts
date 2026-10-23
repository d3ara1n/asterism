import { nanoid } from "nanoid";
import { SubmitAgentInput, CancelAgent, type AgentMessageSender } from "@atelier/builtin-api/contracts";
import type { ModelInputPart } from "@atelier/sdk/contracts";
import type { PluginContext, ResourceRef, ResourceActionOptions } from "@atelier/sdk/runtime";

/** 后台插件凭资源引用提交完整输入；返回表示已受理，执行状态由 Agent 自身维护。 */
export async function steerAgent(plugin: PluginContext, agent: ResourceRef, parts: ModelInputPart[], options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, {
    submissionId: nanoid(16), mode: "steer", parts,
  }, options);
}

/** 中继适配者提供自己的资源地址与该资源上的代理名，正文保持原样。 */
export async function deliverAgentMessage(plugin: PluginContext, agent: ResourceRef,
  sender: Extract<AgentMessageSender, { kind: "agent" }>, parts: ModelInputPart[], options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, {
    submissionId: nanoid(16), mode: "steer", sender, parts,
  }, options);
}

/** Agent 的独立执行通过资源动作取消，与提交请求本身的取消分别处理。 */
export async function stopAgent(plugin: PluginContext, agent: ResourceRef) {
  await plugin.session(agent.sessionId).invoke(CancelAgent, agent, {});
}
