import { z } from "zod";
import { defineImplementation } from "@asterism-app/sdk/contracts";
import { Agent, builtin, Send, sendResultSchema } from "@asterism-app/builtin-api/contracts";
export { sendResultSchema, type SendResult } from "@asterism-app/builtin-api/contracts";

export const AgentSend = defineImplementation({
  ...builtin.data("agent.send", sendResultSchema), resource: Agent, tool: Send,
  targetSchema: z.null().describe("Null selects this Agent. The resource ID identifies the recipient."),
  effect: "write", execution: "sequential",
});
