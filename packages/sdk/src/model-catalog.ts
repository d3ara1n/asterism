import { z } from "zod";
import { defineData } from "./presentation.ts";
import { modelCostSchema } from "./model-cost.ts";
import { thinkingSchema } from "./model-selection.ts";

export const catalogModelSchema = z.object({
  providerId: z.string(), modelId: z.string(), name: z.string(), enabled: z.boolean(),
  contextWindow: z.number().nullable(), cost: modelCostSchema.nullable(),
  generation: z.object({ maxOutputTokens: z.number().nullable() }),
  capabilities: z.object({ reasoning: z.boolean(), tools: z.boolean(), thinkingLevels: z.array(thinkingSchema) }),
});
/** Configured model metadata for plugin selectors and diagnostics; credentials remain backend capabilities. */
export const ModelCatalog = defineData("asterism.models/catalog", z.object({
  modelProviders: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  models: z.array(catalogModelSchema),
}));
export type ModelCatalogSnapshot = z.infer<typeof ModelCatalog.schema>;
export type CatalogModel = z.infer<typeof catalogModelSchema>;
