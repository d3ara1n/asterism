import { z } from "zod";
import { jsonSchema, thinkingLevels, type Json, type ThinkingLevel } from "@asterism/sdk/contracts";
import type { ModelProviderInput } from "./configuration.ts";

/** Application-predefined declaration catalog; parameters and display share a source and request projection interprets behavior by id. */
export type ModelCompatibilityDefinition = {
  id: string;
  /** User reference only; not used for automatic enablement, addition restrictions, or runtime matching. */
  appliesTo: {
    protocols: readonly ModelProviderInput["protocol"][];
    endpoints?: readonly string[];
  };
} & (
  | { kind: "tag"; schema: z.ZodUndefined }
  | { kind: "options"; schema: z.ZodType<Json>; initialValue: Json }
);

const activeThinkingLevels = thinkingLevels.filter(level => level !== "off");
const customThinkingLevelsSchema = z.strictObject(Object.fromEntries(thinkingLevels.map(level => [
  level, z.string().trim().min(1).nullable().optional().meta({
    title: level,
    description: "An upstream effort string, or null to omit effort. Unset uses the protocol default.",
  }),
]))) as z.ZodObject<{ [Level in ThinkingLevel]: z.ZodOptional<z.ZodNullable<z.ZodString>> }>;
const customThinkingBudgetsSchema = z.strictObject(Object.fromEntries(activeThinkingLevels.map(level => [
  level, z.number().int().min(1024).max(Number.MAX_SAFE_INTEGER).optional().meta({
    title: level,
    description: "Thinking tokens for manual-budget models. Unset uses the built-in budget; does not enable manual thinking.",
  }),
]))) as z.ZodObject<{ [Level in Exclude<ThinkingLevel, "off">]: z.ZodOptional<z.ZodNumber> }>;

export type CustomThinkingLevels = z.infer<typeof customThinkingLevelsSchema>;
export type CustomThinkingBudgets = z.infer<typeof customThinkingBudgetsSchema>;

export const modelCompatibilityDefinitions: readonly ModelCompatibilityDefinition[] = [
  {
    id: "customThinkingLevels",
    kind: "options",
    initialValue: {},
    appliesTo: { protocols: ["openai-responses", "openai-chat", "anthropic"] },
    schema: customThinkingLevelsSchema.meta({
      title: "Custom thinking levels",
      description: "Map standard levels to upstream effort values. Does not change available levels, history or token budgets.",
    }),
  },
  {
    id: "customThinkingBudgets",
    kind: "options",
    initialValue: {},
    appliesTo: { protocols: ["anthropic"] },
    schema: customThinkingBudgetsSchema.meta({
      title: "Custom thinking budgets",
      description: "Override manual thinking budgets in tokens. Adaptive thinking keeps its effort mapping.",
    }),
  },
  {
    id: "customUserAgent",
    kind: "options",
    initialValue: { userAgent: "" },
    appliesTo: { protocols: ["openai-responses", "openai-chat", "anthropic"] },
    schema: z.strictObject({
      userAgent: z.string().trim().min(1).regex(/^[\x20-\x7e]+$/u).meta({
        title: "User-Agent", description: "HTTP client identity. Overrides the identity supplied by the caller.",
      }),
    }).meta({
      title: "Custom User-Agent",
      description: "Override the User-Agent header for model requests and connection tests.",
    }),
  },
  {
    id: "opencodeSession",
    kind: "tag",
    appliesTo: {
      protocols: ["openai-responses", "openai-chat", "anthropic"],
      endpoints: ["https://opencode.ai/inference/go/v1"],
    },
    schema: z.undefined().meta({
      title: "OpenCode session header",
      description: "Send a stable conversation ID in x-opencode-session. Standalone calls use a temporary ID.",
    }),
  },
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
    id: "responsesReasoning",
    kind: "options",
    initialValue: {},
    appliesTo: { protocols: ["openai-responses"] },
    schema: z.strictObject({
      content: z.enum(["array", "object"]).optional().meta({ title: "Reasoning content shape", description: "Defaults to an array of reasoning_text parts." }),
      encryptedContent: z.boolean().optional().meta({ title: "Request encrypted content", description: "Defaults to true. Disable when the endpoint does not accept reasoning.encrypted_content in include." }),
      summary: z.boolean().optional().meta({ title: "Request a reasoning summary", description: "Defaults to true. Disable when the endpoint does not accept reasoning.summary." }),
    }).meta({
      title: "Responses reasoning fields",
      description: "Adapt endpoint field shapes and accepted request parameters. Plain text, summaries and opaque continuation remain native capabilities.",
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

/** Each layer saves explicit entries only; protocols do not block saves and duplicate ids within a layer are forbidden. */
export const modelCompatibilitySchema = z.array(entrySchema).superRefine((entries, context) => {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate model compatibility setting." });
    ids.add(entry.id);
  });
});

/** Shared by requests and presentation: merge by id with whole model entries taking precedence; omitted parameters do not inherit from providers. */
export function mergeModelCompatibility(
  provider: readonly ModelCompatibility[], model: readonly ModelCompatibility[],
): ModelCompatibility[] {
  return [...new Map([...provider, ...model].map(entry => [entry.id, entry])).values()];
}
