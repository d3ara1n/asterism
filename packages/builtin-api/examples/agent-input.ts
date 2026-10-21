import { SubmitAgentInput, CancelAgent } from "@atelier/builtin-api/contracts";
import type { ModelInputPart } from "@atelier/sdk/contracts";
import type { PluginContext, ResourceRef, ResourceActionOptions } from "@atelier/sdk/runtime";

/** 后台插件凭资源引用提交完整输入；返回表示已受理，执行状态由 Agent 自身维护。 */
export async function steerAgent(plugin: PluginContext, agent: ResourceRef, parts: ModelInputPart[], options?: ResourceActionOptions) {
  await plugin.session(agent.sessionId).invoke(SubmitAgentInput, agent, {
    submissionId: crypto.randomUUID(), mode: "steer", parts,
  }, options);
}

/** Agent 的独立执行通过资源动作取消，与提交请求本身的取消分别处理。 */
export async function stopAgent(plugin: PluginContext, agent: ResourceRef) {
  await plugin.session(agent.sessionId).invoke(CancelAgent, agent, {});
}
