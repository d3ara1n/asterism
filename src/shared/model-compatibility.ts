import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import type { ProviderInput } from "./configuration.ts";
import { temporaryModelCompatibility } from "./model-compatibility-preview.ts";

/** 应用预定义的声明目录；参数与展示同源，行为由请求投影层按 id 解释。 */
export type ModelCompatibilityDefinition = {
  id: string;
  protocols: readonly ProviderInput["protocol"][];
} & (
  | { kind: "tag"; schema: z.ZodUndefined }
  | { kind: "options"; schema: z.ZodType<Json>; initialValue: Json }
);

export const modelCompatibilityDefinitions: readonly ModelCompatibilityDefinition[] = temporaryModelCompatibility;

export function modelCompatibilityDefinition(id: string): ModelCompatibilityDefinition | undefined {
  return modelCompatibilityDefinitions.find(definition => definition.id === id);
}

export type ModelCompatibility = { id: string } | { id: string; value: Json };
const entrySchema = z.strictObject({ id: z.string().min(1), value: jsonSchema.optional() }).transform<ModelCompatibility>((entry, context) => {
  const definition = modelCompatibilityDefinition(entry.id);
  if (!definition) {
    context.addIssue({ code: "custom", path: ["id"], message: "Unknown model compatibility setting." });
    return z.NEVER;
  }
  const parsed = definition.schema.safeParse(entry.value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: ["value", ...issue.path], message: issue.message });
    return z.NEVER;
  }
  return parsed.data === undefined ? { id: entry.id } : { id: entry.id, value: parsed.data };
});

/** 列表只包含用户已添加的项；不按协议阻止保存，不合并或继承。 */
export const modelCompatibilitySchema = z.array(entrySchema).superRefine((entries, context) => {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate model compatibility setting." });
    ids.add(entry.id);
  });
});
