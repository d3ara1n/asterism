import { z } from "zod";
import { modelExpressionSchema, thinkingSchema } from "@asterism-app/sdk/contracts";
/** Configurations use readable slugs for identification by both users and models. */
export const configurationIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u, "Use lowercase letters, digits, hyphens or underscores.");
export const modelRoleInputSchema = z.strictObject({
  model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable(), enabled: z.boolean(), description: z.string().max(20_000), hidden: z.boolean(),
});
export const modelRoleSchema = modelRoleInputSchema.extend({ id: configurationIdSchema, builtin: z.boolean() });
export const modelRoleOverridesSchema = modelRoleInputSchema.partial();
export type ModelRole = z.infer<typeof modelRoleSchema>;
export type ModelRoleOverrides = z.infer<typeof modelRoleOverridesSchema>;
/** Execution limits applied to subagent runs; workbench Agents have no budget. */
export const agentBudgetSchema = z.strictObject({
  maxRequests: z.number().int().positive(),
  maxDurationSeconds: z.number().int().positive().max(2147483),
});
export type AgentBudget = z.infer<typeof agentBudgetSchema>;
const subagentConfigurationSchema = z.strictObject({
  instructions: z.string().max(100_000),
  budget: agentBudgetSchema,
});
const resourceTypesSchema = z.array(z.string().trim().min(1).max(160)).max(200).nullable();
const agentFieldsSchema = z.strictObject({
  enabled: z.boolean(), description: z.string().max(20_000), systemPrompt: z.string().max(100_000),
  modelRole: configurationIdSchema.nullable(), examples: z.array(z.string().max(4_000)).max(50),
  subagent: subagentConfigurationSchema,
  resources: resourceTypesSchema,
  excludeResources: resourceTypesSchema,
  delegates: z.array(configurationIdSchema).max(200).nullable(),
});
export const agentInputSchema = agentFieldsSchema.refine(value => value.resources === null || value.excludeResources === null,
  "Resource allowlist and denylist are mutually exclusive.");
export const agentSchema = agentInputSchema.safeExtend({ id: configurationIdSchema, builtin: z.boolean() });
// Blank text removes the override on save; false, null, and empty lists retain their respective business meanings. Subagent fields override individually.
export const agentOverridesSchema = agentFieldsSchema.extend({
  subagent: subagentConfigurationSchema.extend({ budget: agentBudgetSchema.partial() }).partial(),
}).partial().refine(value => value.resources == null || value.excludeResources == null,
  "Resource allowlist and denylist are mutually exclusive.");

export type AgentConfiguration = z.infer<typeof agentSchema>;
export type AgentOverrides = z.infer<typeof agentOverridesSchema>;
export const agentSelectionSchema = z.strictObject({
  agent: configurationIdSchema.describe("ID of the configuration supplying this Agent's instructions and model role."),
  model: modelExpressionSchema.nullable().describe("Model for this Agent as provider/model. Null uses the model resolved from its configuration."),
  thinking: thinkingSchema.nullable().describe("Thinking level for this Agent. Null uses the default resolved from its configuration."),
}).describe("The Agent's base configuration and per-instance model settings.");
export type AgentSelection = z.infer<typeof agentSelectionSchema>;
