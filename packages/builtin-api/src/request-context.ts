import { z } from "zod";
import { builtin } from "./identity.ts";

const characters = z.number().int().nonnegative();

/** Structural measurements of a work request, saved with completion; character counts use Unicode code points. */
export const AgentRequestContext = builtin.data("agent.request-context", z.object({
  system: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("system"), from: z.string(), characters }),
    z.strictObject({ kind: z.literal("agent"), role: z.string(), characters }),
    z.strictObject({ kind: z.literal("context"), file: z.string(), characters }),
  ])).optional(),
  tools: z.array(z.string()).optional(),
}));
export type AgentRequestContextData = z.infer<typeof AgentRequestContext.schema>;
