import { z } from "zod";
import { modelExpressionSchema, thinkingSchema } from "@asterism/sdk/contracts";
const id = z.string().min(1).max(160);
/** Configurations use readable slugs for identification by both users and models. */
export const configurationIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u, "Use lowercase letters, digits, hyphens or underscores.");
const names = z.array(id).max(200);
const agentFieldsSchema = z.strictObject({
  enabled: z.boolean(), description: z.string().max(20_000), systemPrompt: z.string().max(100_000),
  modelRole: configurationIdSchema.nullable(), fallbackRole: configurationIdSchema.nullable(), examples: z.array(z.string().max(4_000)).max(50),
  tools: names.nullable(), excludeTools: names.nullable(), subagentRoles: z.array(configurationIdSchema).max(200).nullable(),
  maxTurns: z.number().int().positive().nullable(),
});
export const agentInputSchema = agentFieldsSchema.refine(value => value.tools === null || value.excludeTools === null, "Tool allowlist and denylist are mutually exclusive.");
export const agentSchema = agentInputSchema.safeExtend({ id: configurationIdSchema, builtin: z.boolean() });
// Blank text removes the override on save; false, null, and empty lists retain their respective business meanings.
export const agentOverridesSchema = agentFieldsSchema.partial()
  .refine(value => value.tools == null || value.excludeTools == null, "Tool allowlist and denylist are mutually exclusive.");

export type AgentConfiguration = z.infer<typeof agentSchema>;
export type AgentOverrides = z.infer<typeof agentOverridesSchema>;
export const agentSelectionSchema = z.strictObject({
  agent: configurationIdSchema.describe("ID of the configuration supplying this Agent's instructions and tool policy."),
  model: modelExpressionSchema.nullable().describe("Model for this Agent as provider/model. Null uses the model resolved from its configuration."),
  thinking: thinkingSchema.nullable().describe("Thinking level for this Agent. Null uses the default resolved from its configuration."),
}).describe("The Agent's base configuration and per-instance model settings.");
export type AgentSelection = z.infer<typeof agentSelectionSchema>;
