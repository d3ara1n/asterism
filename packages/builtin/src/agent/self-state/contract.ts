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
  quota: z.array(z.strictObject({
    name: z.string().nullable().describe("Provider quota label; null when the window period alone identifies it."),
    category: z.enum(["allowance", "rate_limit"]).describe("allowance is plan or key usage; rate_limit is a short-term request or token rate bucket."),
    periodSeconds: z.number().nullable().describe("Window length in seconds; null when unknown."),
    remaining: z.number().describe("Remaining share of the window, from 0 to 1."),
    amount: z.strictObject({
      remaining: z.number(), limit: z.number(),
      unit: z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("currency"), code: z.string() }),
        z.strictObject({ type: z.literal("symbol"), symbol: z.string() }),
        z.strictObject({ type: z.literal("count"), label: z.string() }),
      ]),
    }).nullable().describe("Remaining and total quantity when the provider reports amounts rather than only a share."),
    resetsAt: z.iso.datetime().nullable().describe("Next reset as a UTC ISO 8601 string; null when unknown."),
  })).nullable().describe("Quota windows reported for the effective model's provider, in provider order. Null when unavailable."),
}).describe("Calling Agent's effective role, model, thinking level, context capacity/use, and available account or key balances and quotas."));
