import { z } from "zod";
import { defineData } from "./presentation.ts";
import { modelCostSchema } from "./model-cost.ts";
import { thinkingSchema } from "./model-selection.ts";

export const modelMediaModalities = ["image", "audio", "video", "document"] as const;
export const modelMediaModalitySchema = z.enum(modelMediaModalities);
export type ModelMediaModality = z.infer<typeof modelMediaModalitySchema>;
export const modelInputModalitiesSchema = z.array(modelMediaModalitySchema);

export const languageCatalogModelSchema = z.object({
  providerId: z.string(), modelId: z.string(), name: z.string(), enabled: z.boolean(),
  contextWindow: z.number().nullable(), cost: modelCostSchema.nullable(),
  generation: z.object({ maxOutputTokens: z.number().nullable() }),
  capabilities: z.object({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema), inputModalities: modelInputModalitiesSchema.optional() }),
});
/** Enabled model metadata available to runtime consumers; model is the complete provider/model expression. */
export const languageModelInfoSchema = languageCatalogModelSchema.omit({ providerId: true, modelId: true, enabled: true }).extend({
  provider: z.string(), model: z.string(),
});
export type LanguageModelInfo = z.infer<typeof languageModelInfoSchema>;
/** Configured model metadata for plugin selectors and diagnostics; credentials remain backend capabilities. */
export const LanguageModelCatalog = defineData("asterism.language-models/catalog", z.object({
  languageModelProviders: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  languageModels: z.array(languageCatalogModelSchema),
}));
export type LanguageModelCatalogSnapshot = z.infer<typeof LanguageModelCatalog.schema>;
export type CatalogLanguageModel = z.infer<typeof languageCatalogModelSchema>;
