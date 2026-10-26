import type { ModelItem } from "@asterism/sdk/contracts";
import { PluginApiError, type SessionSnapshot } from "@asterism/sdk/runtime";
import { contextMessages, ContextProjectionError, projectAgentContext as project, type AgentContext } from "./context-projection.ts";

export { contextMessages, type AgentContext, type ContextGroup } from "./context-projection.ts";

/** 后台入口：投影规则见 context-projection.ts；损坏的历史以插件错误报告给调用方。 */
export function projectAgentContext(snapshot: Pick<SessionSnapshot, "records">, agentId: string): AgentContext {
  try { return project(snapshot, agentId); }
  catch (error) {
    if (error instanceof ContextProjectionError) throw new PluginApiError("invalid_argument", error.message);
    throw error;
  }
}
export function projectForAgent(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ModelItem[] {
  return contextMessages(projectAgentContext(snapshot, agentId));
}
