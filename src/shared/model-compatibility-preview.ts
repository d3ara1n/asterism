import { z } from "zod";
import type { ModelCompatibilityDefinition } from "./model-compatibility.ts";

/** 临时 UI 验收条目；无请求行为。验收后连同预览配置移除，不作为正式兼容包发布。 */
export const temporaryModelCompatibility: readonly ModelCompatibilityDefinition[] = [
  {
    id: "previewTag",
    kind: "tag",
    protocols: ["openai-responses"],
    schema: z.undefined().meta({
      title: "Preview tag (temporary)",
      description: "Temporary UI preview. This tag does not change model requests.",
    }),
  },
  {
    id: "previewOptions",
    kind: "options",
    protocols: ["openai-chat", "anthropic"],
    schema: z.strictObject({
      text: z.string().min(1).optional().meta({ title: "Text", description: "Leave unset to omit this value." }),
      mode: z.enum(["first", "second"]).optional().meta({ title: "Mode" }),
      count: z.number().int().min(1).optional().meta({ title: "Count" }),
      enabled: z.boolean().optional().meta({ title: "Enabled" }),
    }).meta({
      title: "Preview options (temporary)",
      description: "Temporary UI preview. These values are saved but do not change model requests.",
    }),
    initialValue: {},
  },
];
