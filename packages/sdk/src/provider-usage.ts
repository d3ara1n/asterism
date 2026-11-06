import { z } from "zod";
import { uiTextSchema } from "./i18n.ts";

/** Usage implementations have global catalog identities, independent of configured model connections. */
export const providerUsageIdSchema = z.string().trim().min(1).max(160).regex(/^\S+$/u);

/**
 * Units shared by balances and quota quantities: ISO currencies format natively, a site-defined symbol prefixes the amount,
 * and a count carries its own label.
 */
export const usageUnitSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("currency"), code: z.string().regex(/^[A-Z]{3}$/u) }),
  z.strictObject({ type: z.literal("symbol"), symbol: z.string().trim().min(1) }),
  z.strictObject({ type: z.literal("count"), label: uiTextSchema }),
]);
export type UsageUnit = z.infer<typeof usageUnitSchema>;

const identity = {
  id: z.string().trim().min(1),
  scope: z.enum(["account", "plan", "key", "connection"]),
};
export const quotaValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ratio"), remaining: z.number().min(0).max(1) }),
  z.strictObject({ type: z.literal("quantity"), remaining: z.number().nonnegative(), limit: z.number().positive(), unit: usageUnitSchema })
    .refine(value => value.remaining <= value.limit, "Remaining quota cannot exceed its limit."),
]);
export const usageItemSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...identity, type: z.literal("balance"), label: uiTextSchema, remaining: z.number(), unit: usageUnitSchema }),
  z.strictObject({ ...identity, type: z.literal("quota"), value: quotaValueSchema,
    /** Optional when the period alone names the window; presentation appends the period to any label. */
    label: uiTextSchema.optional(),
    category: z.enum(["allowance", "rate_limit"]).optional(),
    window: z.strictObject({
      mode: z.enum(["rolling", "fixed", "unknown"]),
      /** Window length in seconds. The provider knows its service's windows even when the response omits them; null only when it genuinely does not. */
      periodSeconds: z.number().positive().nullable(),
      /** Epoch milliseconds. */
      resetAt: z.number().nonnegative().nullable(),
    }),
  }).refine(item => item.label !== undefined || item.window.periodSeconds !== null, "A quota needs a label or a known period."),
]);
export const usageItemsSchema = z.array(usageItemSchema).refine(items => new Set(items.map(item => item.id)).size === items.length,
  "Usage item IDs must be unique.");
export type UsageItem = z.infer<typeof usageItemSchema>;
export type QuotaItem = Extract<UsageItem, { type: "quota" }>;
export type BalanceItem = Extract<UsageItem, { type: "balance" }>;
export const providerUsageErrorSchema = z.enum(["unavailable", "credential", "authentication", "unsupported", "rate_limit", "network", "timeout", "protocol", "server"]);
export type ProviderUsageError = z.infer<typeof providerUsageErrorSchema>;
export const usageProviderInfoSchema = z.strictObject({ id: providerUsageIdSchema, label: uiTextSchema, owner: z.string(),
  source: z.enum(["query", "headers"]).default("query") });
export type UsageProviderInfo = z.infer<typeof usageProviderInfoSchema>;

export function quotaRemaining(item: QuotaItem): number {
  return item.value.type === "ratio" ? item.value.remaining : item.value.remaining / item.value.limit;
}
/** Select the window with the shortest period, independently of the reset countdown; unknown periods follow known ones, and equal lengths retain source order. */
export function primaryQuota(items: readonly UsageItem[]): QuotaItem | null {
  let selected: QuotaItem | null = null;
  for (const item of items) if (item.type === "quota" && (!selected ||
    (item.window.periodSeconds ?? Infinity) < (selected.window.periodSeconds ?? Infinity))) selected = item;
  return selected;
}

export type UsagePeriodUnit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";
const periodUnits: readonly [UsagePeriodUnit, number][] = [
  ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60],
];
/** States a period in the largest unit that expresses it within one decimal place; months and years count as 30 and 365 days. */
export function usagePeriodParts(seconds: number): { value: number; unit: UsagePeriodUnit } {
  for (const [unit, size] of periodUnits) {
    const tenths = seconds / size * 10;
    if (tenths >= 10 && Math.abs(tenths - Math.round(tenths)) < 1e-9) return { value: Math.round(tenths) / 10, unit };
  }
  return { value: seconds, unit: "second" };
}
