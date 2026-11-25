import { z } from "zod";
import { defineImplementation } from "@asterism-app/sdk/contracts";
import { Agent, builtin, Wait } from "@asterism-app/builtin-api/contracts";
import { agentExecutionStateSchema } from "../state.ts";

export const agentWaitResultSchema = z.strictObject({
  name: z.string().describe("The waited Agent's name."),
  executionState: agentExecutionStateSchema.describe("completed or incomplete after settling; empty when the Agent has no turn; running when the wait ended first."),
  elapsedMs: z.number().describe("Elapsed wait time in milliseconds."),
}).describe("The Agent's execution state when the wait ended.");
export type AgentWaitResult = z.infer<typeof agentWaitResultSchema>;
export const AgentWait = defineImplementation({
  ...builtin.data("agent.wait", agentWaitResultSchema), resource: Agent, tool: Wait,
  targetSchema: z.null().describe("Null waits until this Agent's active task stops. The result describes whether the latest input has a final reply, not whether the draft queue is empty. An Agent cannot wait for itself. Timeout or cancellation stops the wait, not the Agent."),
  effect: "read", execution: "sequential",
});
