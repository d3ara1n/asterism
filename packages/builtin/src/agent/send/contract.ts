import { z } from "zod";
import { defineImplementation } from "@atelier/sdk/contracts";
import { Agent, builtin, Send, submissionIdSchema } from "@atelier/builtin-api/contracts";

export const sendResultSchema = z.strictObject({
  name: z.string(), submissionId: submissionIdSchema,
}).describe("Accepted input identity and recipient Agent name. Processing proceeds independently.");
export type SendResult = z.infer<typeof sendResultSchema>;
export const AgentSend = defineImplementation({
  ...builtin.data("agent.send", sendResultSchema), resource: Agent, tool: Send,
  targetSchema: z.null().describe("Null selects this Agent. The resource ID identifies the recipient."),
  effect: "write", execution: "sequential",
});
