import { z } from "zod";
import { thinkingSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const requestStateSchema = z.strictObject({
  role: z.string().describe("Agent role ID."),
  model: z.string().describe("Complete provider/model expression, without a thinking suffix."),
  thinking: thinkingSchema.nullable().describe("Effective thinking level; null uses the provider default."),
});
export type AgentRequestState = z.infer<typeof requestStateSchema>;
export const GetAgentStateResult = builtin.data("agent.self-state", requestStateSchema.extend({
  context: z.strictObject({
    max: z.number().nullable().describe("Configured maximum context tokens for the effective model; null when unknown."),
    used: z.number().nullable().describe("Latest reported input tokens for the effective model, including cached input. Null when unknown, from a different model, or superseded by compression."),
  }),
  balance: z.array(z.strictObject({
    name: z.string().describe("Provider balance label, such as account balance or key balance."),
    remaining: z.number().describe("Reported money remaining; zero or negative amounts are preserved."),
    unit: z.string().describe("Currency code or the provider's monetary symbol."),
  })).nullable().describe("Monetary balances reported for the effective model's provider, kept separately. Null when unavailable. Quotas and request token usage are not money balances."),
}).describe("Calling Agent's effective role, model, thinking level, context capacity/use, and available account or key balances."));
