import { z } from "zod";

/** 当前路径的回合状态，由历史和运行时中断位置投影得到；不另行持久化。 */
export const agentTurnStateSchema = z.enum(["empty", "completed", "incomplete"]);
export type AgentTurnState = z.infer<typeof agentTurnStateSchema>;
export const agentExecutionStateSchema = z.enum(["empty", "completed", "incomplete", "running"]);
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;

/** 执行循环与历史由 Agent 在同一次投影中读取。 */
export function agentExecutionState(turnState: AgentTurnState, running: boolean): AgentExecutionState {
  return running ? "running" : turnState;
}
