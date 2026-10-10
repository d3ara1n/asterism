import { resolveModelRole, type ConfigurationSnapshot } from "../../../shared/configuration";

/** 创建前的代理选择：没有调用方可继承，默认配置失效时要求明确选择模型。 */
export function initialAgentSelection(configuration: ConfigurationSnapshot, agentId: string) {
  const agent = configuration.agents.find(item => item.id === agentId && item.enabled);
  if (!agent) return { agentId: null, modelId: null, thinking: null, error: null };
  const resolved = resolveModelRole(configuration, agent.modelRole ?? "default");
  return {
    agentId: agent.id,
    modelId: resolved.error ? null : resolved.model,
    thinking: resolved.thinking,
    error: resolved.error,
  };
}
