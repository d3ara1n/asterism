import { z } from "zod";
import { defineImplementation } from "@asterism-app/sdk/contracts";
import { Agent, builtin, Peek, peekResultSchema } from "@asterism-app/builtin-api/contracts";
export { Peek, peekResultSchema, type PeekResult } from "@asterism-app/builtin-api/contracts";

export const AgentPeek = defineImplementation({
  ...builtin.data("agent.peek", peekResultSchema), resource: Agent, tool: Peek,
  targetSchema: z.null().describe("Null selects this Agent's saved timeline records."),
  effect: "read", execution: "parallel",
});
