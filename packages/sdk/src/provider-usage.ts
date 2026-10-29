import { z } from "zod";
import { uiTextSchema } from "./i18n.ts";

/** Usage implementations have global catalog identities, independent of configured model connections. */
export const providerUsageIdSchema = z.string().trim().min(1).max(160).regex(/^\S+$/u);

const identity = {
  id: z.string().trim().min(1), label: uiTextSchema,
  scope: z.enum(["account", "plan", "key", "connection"]),
};
export const quotaValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ratio"), remaining: z.number().min(0).max(1) }),
  z.strictObject({ type: z.literal("quantity"), remaining: z.number().nonnegative(), limit: z.number().positive(), unit: uiTextSchema })
    .refine(value => value.remaining <= value.limit, "Remaining quota cannot exceed its limit."),
]);
export const usageItemSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...identity, type: z.literal("balance"), remaining: z.number(), currency: z.string().regex(/^[A-Z]{3}$/u) }),
  z.strictObject({ ...identity, type: z.literal("quota"), value: quotaValueSchema,
    category: z.enum(["allowance", "rate_limit"]).optional(),
    window: z.strictObject({
      mode: z.enum(["rolling", "fixed", "unknown"]),
      /** Supply an actual fixed duration only when known; unknown periods must not be fabricated as weeks or months. */
      durationMs: z.number().positive().nullable(),
      resetAt: z.number().nonnegative().nullable(),
    }),
  }),
]);
export const usageItemsSchema = z.array(usageItemSchema).refine(items => new Set(items.map(item => item.id)).size === items.length,
  "Usage item IDs must be unique.");
export type UsageItem = z.infer<typeof usageItemSchema>;
export type QuotaItem = Extract<UsageItem, { type: "quota" }>;
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
    (item.window.durationMs ?? Infinity) < (selected.window.durationMs ?? Infinity))) selected = item;
  return selected;
}
