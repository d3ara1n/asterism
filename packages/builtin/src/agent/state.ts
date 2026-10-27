import { z } from "zod";

/** Turn state on the current path, projected from history and runtime interruption positions; not persisted separately. */
export const agentTurnStateSchema = z.enum(["empty", "completed", "incomplete"]);
export type AgentTurnState = z.infer<typeof agentTurnStateSchema>;
export const agentExecutionStateSchema = z.enum(["empty", "completed", "incomplete", "running"]);
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;

/** The Agent reads the execution loop and history in the same projection. */
export function agentExecutionState(turnState: AgentTurnState, running: boolean): AgentExecutionState {
  return running ? "running" : turnState;
}
