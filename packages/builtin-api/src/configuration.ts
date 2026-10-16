import { z } from "zod";
import { modelExpressionSchema, thinkingSchema } from "@atelier/sdk/contracts";
const id = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(160);
const revision = z.number().int().positive();
const names = z.array(id).max(200);
const agentFieldsSchema = z.strictObject({
  name, enabled: z.boolean(), description: z.string().max(20_000), systemPrompt: z.string().max(100_000),
  modelRole: id.nullable(), fallbackRole: id.nullable(), examples: z.array(z.string().max(4_000)).max(50), decisionTrigger: z.string().max(4_000),
  tools: names.nullable(), excludeTools: names.nullable(), subagentRoles: names.nullable(),
  timeout: z.number().int().positive().max(86_400).nullable(), maxTurns: z.number().int().positive().nullable(),
});
export const agentInputSchema = agentFieldsSchema.refine(value => value.tools === null || value.excludeTools === null, "Tool allowlist and denylist are mutually exclusive.");
export const agentSchema = agentInputSchema.safeExtend({ id, revision, builtin: z.boolean() });
// 留空文本在保存时移除覆盖；false、null 和空列表保留各自的业务含义。
const overrideName = z.string().trim().max(160).optional();
export const agentOverridesSchema = agentFieldsSchema.partial().extend({ name: overrideName })
  .refine(value => value.tools == null || value.excludeTools == null, "Tool allowlist and denylist are mutually exclusive.");

export type AgentConfiguration = z.infer<typeof agentSchema>;
export type AgentOverrides = z.infer<typeof agentOverridesSchema>;
export const agentSelectionSchema = z.strictObject({ agent: id, model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable() });
export type AgentSelection = z.infer<typeof agentSelectionSchema>;
