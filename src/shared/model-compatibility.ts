import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import type { ProviderInput } from "./configuration.ts";
import { temporaryModelCompatibility } from "./model-compatibility-preview.ts";

/** 应用预定义的声明目录；参数与展示同源，行为由请求投影层按 id 解释。 */
export type ModelCompatibilityDefinition = {
  id: string;
  /** 仅供用户参考；不用于自动启用、添加限制或运行时匹配。 */
  appliesTo: {
    protocols: readonly ProviderInput["protocol"][];
    endpoints?: readonly string[];
  };
} & (
  | { kind: "tag"; schema: z.ZodUndefined }
  | { kind: "options"; schema: z.ZodType<Json>; initialValue: Json }
);

export const modelCompatibilityDefinitions: readonly ModelCompatibilityDefinition[] = [
  {
    id: "systemMessageInMessages",
    kind: "tag",
    appliesTo: { protocols: ["openai-responses"] },
    schema: z.undefined().meta({
      title: "System prompt in messages",
      description: "Send the system prompt as the first system message instead of the instructions field.",
    }),
  },
  {
    id: "thinkingInDeepSeekFormat",
    kind: "tag",
    appliesTo: { protocols: ["openai-responses"], endpoints: ["https://api.deepseek.com"] },
    schema: z.undefined().meta({
      title: "DeepSeek thinking format",
      description: "Send visible thinking as plain-text reasoning items instead of encrypted reasoning or summaries.",
    }),
  },
  {
    id: "toolFilesAsUserMessage",
    kind: "tag",
    appliesTo: { protocols: ["openai-chat"] },
    schema: z.undefined().meta({
      title: "Tool files in a user message",
      description: "Send files from tool results in a following user message, with a reference in the tool result.",
    }),
  },
  ...temporaryModelCompatibility,
];

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
