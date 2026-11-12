import { parseModelExpression, type ModelCost, type ModelRates, type UnitPrice } from "@asterism-app/sdk/contracts";

export interface ProviderGroup { provider: string; models: { expression: string; model: string }[] }

/** Groups follow the listing's first-seen provider order and keep model order; the model ID is the text after the first slash. */
export function groupByProvider(expressions: readonly string[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const expression of expressions) {
    const parsed = parseModelExpression(expression);
    const provider = parsed?.provider ?? "";
    const group = groups.get(provider) ?? { provider, models: [] };
    groups.set(provider, group);
    group.models.push({ expression, model: parsed?.model ?? expression });
  }
  return [...groups.values()];
}

export const priceModalities = ["text", "image", "audio", "video"] as const satisfies readonly (keyof ModelRates)[];
export const priceItems = ["input", "cacheRead", "cacheWrite", "output", "reasoning"] as const;
export type PriceModality = typeof priceModalities[number];
export type PriceItem = typeof priceItems[number];
export interface PriceRow { item: PriceItem; price: UnitPrice; share: number }
export interface PriceSection { modality: PriceModality; rows: PriceRow[] }

/**
 * Bar shares compare per-unit amounts within one modality and billing unit: prices quoted per different bases stay comparable,
 * and token, image, and second prices are never mixed. Modalities without any configured price are omitted.
 */
export function priceSections(rates: ModelRates): PriceSection[] {
  return priceModalities.flatMap(modality => {
    const rows = priceItems.flatMap(item => {
      const price = rates[modality][item];
      return price ? [{ item, price, perUnit: price.amount / price.per }] : [];
    });
    if (!rows.length) return [];
    const max = new Map<UnitPrice["unit"], number>();
    for (const row of rows) max.set(row.price.unit, Math.max(max.get(row.price.unit) ?? 0, row.perUnit));
    return [{ modality, rows: rows.map(({ item, price, perUnit }) => {
      const top = max.get(price.unit)!;
      return { item, price, share: top > 0 ? perUnit / top : 0 };
    }) }];
  });
}

export interface PriceTable { fromInputTokens: number | null; rates: ModelRates }
/** Base rates apply below the first threshold; a tier replaces every price once the request's total input reaches it. */
export function priceTables(cost: ModelCost | null): PriceTable[] {
  return cost ? [{ fromInputTokens: null, rates: cost.rates }, ...cost.tiers] : [];
}
