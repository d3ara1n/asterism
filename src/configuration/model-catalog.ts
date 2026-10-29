import { Models, type Catalog, type Model, type ModelMetadata } from "@opencode-ai/models";
import { z } from "zod";
import { modelParametersSchema, thinkingSchema, type ModelParameters, type ModelParameterUpdate } from "../shared/configuration.ts";
import { modelCatalogMessages as messages } from "../shared/model-catalog-messages.ts";
import { emptyModelRates, modelCostSchema, withValues, type ModelCost, type ModelRates, type UnitPrice } from "@asterism-app/sdk/contracts";
import { parameterModelId } from "../shared/model-catalog-id.ts";
import { ConfigurationError } from "./errors.ts";

export type LoadModelCatalog = (signal: AbortSignal) => Promise<Catalog>;
const client = Models.make({ fetch: (url, init) => fetch(url, { ...init, redirect: "error" }) });
/** The official client owns catalog types and transport; no provider credentials are sent to the catalog and stale snapshots are not silently reused. */
export const loadModelCatalog: LoadModelCatalog = signal => client.catalog({ signal });

type Match = { source: string; model: Model | ModelMetadata };

function selectModel(catalog: Catalog, modelId: string): Match {
  const lookupId = parameterModelId(modelId);
  if (!lookupId) throw new ConfigurationError("not_found", "No exact model catalog match was found.", withValues(messages.notFound, { modelId: lookupId }));
  const matches: Match[] = [];
  for (const [key, metadata] of Object.entries(catalog.models)) {
    // The first catalog key segment is the models.dev vendor group, not another form of the user's model ID.
    const slash = key.indexOf("/");
    if (slash < 1) continue;
    const lab = key.slice(0, slash);
    const entryId = key.slice(slash + 1);
    const native = catalog.providers[lab]?.models[entryId];
    if (parameterModelId(native?.id ?? entryId) === lookupId) matches.push({ source: key, model: native ?? metadata });
  }
  if (matches.length > 1) throw new ConfigurationError("conflict", "Multiple catalog models match this ID.", withValues(messages.ambiguous, { modelId: lookupId }));
  const match = matches[0];
  if (!match) throw new ConfigurationError("not_found", "No exact model catalog match was found.", withValues(messages.notFound, { modelId: lookupId }));
  return match;
}

// Validate only consumed fields rather than copying the SDK's complete catalog schema.
const entrySchema = z.object({
  cost: z.unknown().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  limit: z.object({ context: z.number().int().nonnegative(), output: z.number().int().nonnegative().optional() }).optional(),
  reasoning_options: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("effort"), values: z.array(z.string().nullable()) }),
    z.object({ type: z.literal("toggle") }),
    z.object({ type: z.literal("budget_tokens") }),
  ])).optional(),
});

// External catalog shapes exist only at the conversion boundary; configuration and consumers use Asterism's pricing contract.
const catalogPrice = z.number().nonnegative();
const catalogRatesSchema = z.strictObject({
  input: catalogPrice, output: catalogPrice,
  cache_read: catalogPrice.optional(), cache_write: catalogPrice.optional(),
  reasoning: catalogPrice.optional(), input_audio: catalogPrice.optional(), output_audio: catalogPrice.optional(),
});
const catalogCostSchema = catalogRatesSchema.extend({
  context_over_200k: z.unknown().optional(),
  tiers: z.array(catalogRatesSchema.extend({
    tier: z.strictObject({ type: z.literal("context"), size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  })).optional(),
});
function tokenPrice(amount: number | undefined): UnitPrice | null {
  return amount === undefined ? null : { amount, unit: "token", per: 1_000_000 };
}
function modelRates(value: z.infer<typeof catalogRatesSchema>): ModelRates {
  const rates = emptyModelRates();
  rates.text = {
    input: tokenPrice(value.input), output: tokenPrice(value.output),
    cacheRead: tokenPrice(value.cache_read), cacheWrite: tokenPrice(value.cache_write), reasoning: tokenPrice(value.reasoning),
  };
  rates.audio.input = tokenPrice(value.input_audio);
  rates.audio.output = tokenPrice(value.output_audio);
  // Omitted modalities and billing items stay unknown; do not infer image, audio, or video pricing from text unit prices.
  return rates;
}
function modelCost(raw: unknown): ModelCost | null {
  const parsed = catalogCostSchema.safeParse(raw);
  if (!parsed.success) return null;
  const cost = parsed.data;
  const tiers = cost.tiers?.map(tier => ({ fromInputTokens: tier.tier.size, rates: modelRates(tier) })) ?? [];
  if (cost.tiers === undefined && cost.context_over_200k !== undefined) {
    const legacy = catalogRatesSchema.safeParse(cost.context_over_200k);
    if (!legacy.success) return null;
    tiers.push({ fromInputTokens: 200_001, rates: modelRates(legacy.data) });
  }
  tiers.sort((left, right) => left.fromInputTokens - right.fromInputTokens);
  const result = modelCostSchema.safeParse({ currency: "USD", rates: modelRates(cost), tiers });
  return result.success ? result.data : null;
}

/** Return mappable fields for draft editing; omitted fields remain absent and pricing is supplied as a whole. */
export function modelParameters(catalog: Catalog, modelId: string): ModelParameterUpdate {
  try {
    const match = selectModel(catalog, modelId);
    const entry = entrySchema.parse(match.model);
    const value: ModelParameters = { capabilities: {}, generation: {} };
    const unfilled: ModelParameterUpdate["unfilled"] = [];
    if (entry.limit?.context) value.contextWindow = entry.limit.context;
    else unfilled.push("contextWindow");
    if (entry.limit?.output) value.generation.maxOutputTokens = entry.limit.output;
    else unfilled.push("maxOutputTokens");
    if (entry.reasoning !== undefined) value.capabilities.reasoning = entry.reasoning;
    else unfilled.push("reasoning");
    if (entry.tool_call !== undefined) value.capabilities.tools = entry.tool_call;
    else unfilled.push("tools");

    if (entry.reasoning === false) value.capabilities.thinkingLevels = [];
    else {
      const efforts = entry.reasoning_options?.filter(option => option.type === "effort");
      const values = efforts?.flatMap(option => option.values);
      const levels = new Set(values?.map(level => level === null || level === "none" ? "off" : level));
      const mapped = thinkingSchema.options.filter(level => levels.has(level));
      // toggle/budget cannot directly determine Asterism levels; default does not imply any fixed level either.
      if (!mapped.length || [...levels].some(level => !thinkingSchema.safeParse(level).success)) unfilled.push("thinkingLevels");
      else value.capabilities.thinkingLevels = mapped;
    }
    const cost = modelCost(entry.cost);
    if (cost) value.cost = cost;
    else unfilled.push("cost");
    if (unfilled.length === 6) throw new ConfigurationError("unavailable", "No usable catalog parameters were found.", messages.invalid);
    return { parameters: modelParametersSchema.parse(value), source: match.source, unfilled };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError("unavailable", "Invalid model catalog data.", messages.invalid);
  }
}
