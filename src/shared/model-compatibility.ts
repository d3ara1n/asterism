import { z } from "zod";
import { jsonSchema, modelProtocolIds, thinkingLevels, type Json, type ThinkingLevel, type UiText } from "@asterism-app/sdk/contracts";
import { thinkingLabels } from "@asterism-app/ui/messages/model-selection";
import type { ModelProviderInput } from "./configuration.ts";
import { modelCompatibilityMessages as messages } from "./model-compatibility-messages.ts";

type CompatibilityCopy = { title: UiText; description: UiText };

/** Application-predefined declaration catalog; parameters and display share a source and request projection interprets behavior by id. */
export type ModelCompatibilityDefinition = {
  id: string;
  copy: CompatibilityCopy;
  /** User reference only; not used for automatic enablement, addition restrictions, or runtime matching. */
  appliesTo: {
    protocols: readonly ModelProviderInput["protocol"][];
    endpoints?: readonly string[];
  };
} & (
  | { kind: "tag"; schema: z.ZodUndefined }
  | { kind: "options"; schema: z.ZodType<Json>; initialValue: Json }
);

const fieldCopy = z.registry<CompatibilityCopy>();

/** Resolve display metadata for the form without changing validation or saved values. */
export function modelCompatibilityForm(definition: Extract<ModelCompatibilityDefinition, { kind: "options" }>, text: (value: UiText) => string): Json {
  const form = z.toJSONSchema(definition.schema, {
    io: "input",
    override: ({ zodSchema, jsonSchema: field }) => {
      const copy = fieldCopy.get(zodSchema);
      if (copy) {
        field.title = text(copy.title);
        field.description = text(copy.description);
      }
    },
  });
  return jsonSchema.parse({ ...form, title: text(definition.copy.title), description: text(definition.copy.description) });
}

const activeThinkingLevels = thinkingLevels.filter(level => level !== "off");
const customThinkingLevelsSchema = z.strictObject(Object.fromEntries(thinkingLevels.map(level => [
  level, z.string().trim().min(1).nullable().optional().register(fieldCopy, {
    title: thinkingLabels[level], description: messages.thinkingLevel,
  }),
]))) as z.ZodObject<{ [Level in ThinkingLevel]: z.ZodOptional<z.ZodNullable<z.ZodString>> }>;
const customThinkingBudgetsSchema = z.strictObject(Object.fromEntries(activeThinkingLevels.map(level => [
  level, z.number().int().positive().optional().register(fieldCopy, {
    title: thinkingLabels[level], description: messages.thinkingBudget,
  }),
]))) as z.ZodObject<{ [Level in Exclude<ThinkingLevel, "off">]: z.ZodOptional<z.ZodNumber> }>;

export type CustomThinkingLevels = z.infer<typeof customThinkingLevelsSchema>;
export type CustomThinkingBudgets = z.infer<typeof customThinkingBudgetsSchema>;

export const modelCompatibilityDefinitions: readonly ModelCompatibilityDefinition[] = [
  {
    id: "customThinkingLevels",
    kind: "options",
    copy: { title: messages.thinkingLevels, description: messages.thinkingLevelsDescription },
    initialValue: {},
    appliesTo: { protocols: modelProtocolIds },
    schema: customThinkingLevelsSchema,
  },
  {
    id: "customThinkingBudgets",
    kind: "options",
    copy: { title: messages.thinkingBudgets, description: messages.thinkingBudgetsDescription },
    initialValue: {},
    appliesTo: { protocols: ["anthropic"] },
    schema: customThinkingBudgetsSchema,
  },
  {
    id: "messagesPromptCaching",
    kind: "tag",
    copy: { title: messages.promptCaching, description: messages.promptCachingDescription },
    appliesTo: { protocols: ["anthropic"] },
    schema: z.undefined(),
  },
  {
    id: "customUserAgent",
    kind: "options",
    copy: { title: messages.customUserAgent, description: messages.customUserAgentDescription },
    initialValue: { userAgent: "" },
    appliesTo: { protocols: modelProtocolIds },
    schema: z.strictObject({
      userAgent: z.string().trim().min(1).regex(/^[\x20-\x7e]+$/u).register(fieldCopy, {
        title: "User-Agent", description: messages.userAgent,
      }),
    }),
  },
  {
    id: "opencodeSession",
    kind: "tag",
    copy: { title: messages.opencodeSession, description: messages.opencodeSessionDescription },
    appliesTo: {
      protocols: modelProtocolIds,
      endpoints: ["https://opencode.ai/inference/go/v1"],
    },
    schema: z.undefined(),
  },
  {
    id: "systemMessageInMessages",
    kind: "tag",
    copy: { title: messages.systemMessageInMessages, description: messages.systemMessageInMessagesDescription },
    appliesTo: { protocols: ["openai-responses"] },
    schema: z.undefined(),
  },
  {
    id: "responsesReasoning",
    kind: "options",
    copy: { title: messages.responsesReasoning, description: messages.responsesReasoningDescription },
    initialValue: {},
    appliesTo: { protocols: ["openai-responses"] },
    schema: z.strictObject({
      content: z.enum(["array", "object"]).optional().register(fieldCopy, {
        title: messages.reasoningContent, description: messages.reasoningContentDescription,
      }),
      encryptedContent: z.boolean().optional().register(fieldCopy, {
        title: messages.encryptedReasoning, description: messages.encryptedReasoningDescription,
      }),
      summary: z.boolean().optional().register(fieldCopy, {
        title: messages.reasoningSummary, description: messages.reasoningSummaryDescription,
      }),
      requireInputSummary: z.boolean().optional().register(fieldCopy, {
        title: messages.reasoningInputSummary, description: messages.reasoningInputSummaryDescription,
      }),
    }),
  },
  {
    id: "responsesOmitStoredItems",
    kind: "tag",
    copy: { title: messages.responsesOmitStoredItems, description: messages.responsesOmitStoredItemsDescription },
    appliesTo: { protocols: ["openai-responses"] },
    schema: z.undefined(),
  },
  {
    id: "toolFilesAsUserMessage",
    kind: "tag",
    copy: { title: messages.toolFilesAsUserMessage, description: messages.toolFilesAsUserMessageDescription },
    appliesTo: { protocols: ["openai-chat"] },
    schema: z.undefined(),
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
