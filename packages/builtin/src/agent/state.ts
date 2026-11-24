import { z } from "zod";

export const agentExecutionStateSchema = z.enum(["empty", "completed", "incomplete", "running"]);
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;
export type AgentTurnState = Exclude<AgentExecutionState, "running">;
