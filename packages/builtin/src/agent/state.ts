import { z } from "zod";

/** 当前路径的回合状态，由历史投影得到；不另行持久化。 */
export const agentTurnStateSchema = z.enum(["empty", "completed", "incomplete"]);
export type AgentTurnState = z.infer<typeof agentTurnStateSchema>;
export type AgentExecutionState = AgentTurnState | "running";

/** 历史投影随会话视图读取更新，运行活动随进度更新；组合时以当前运行活动为先。 */
export function agentExecutionState(turnState: AgentTurnState, running: boolean): AgentExecutionState {
  return running ? "running" : turnState;
}
