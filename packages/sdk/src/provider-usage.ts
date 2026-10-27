import { z } from "zod";
import { uiTextSchema, type UiText } from "./i18n.ts";
import { jsonSchema, type Json } from "./json.ts";

/** Usage queries and presets use global catalog IDs; connection identity is independent, and duplicate catalog identities must fail explicitly. */
export const providerUsageIdSchema = z.string().trim().min(1).max(160).regex(/^\S+$/u);
export const modelProviderFixedFields = ["protocol", "baseUrl", "auth", "compatibility", "usage"] as const;
export interface ModelProviderConnection {
  protocol: "openai-responses" | "openai-chat" | "anthropic";
  baseUrl: string;
  auth: "api_key" | "none";
  compatibility: { id: string; value?: Json }[];
  usage?: string | null;
  fixedFields?: (typeof modelProviderFixedFields)[number][];
}
export interface ModelProviderPreset {
  id: string;
  name: string;
  billing: "usage" | "subscription" | "none";
  region?: UiText;
  plan?: UiText;
  connection: ModelProviderConnection;
  keyUrl?: string;
  sources: readonly [string, ...string[]];
  verifiedOn: string;
  keywords?: readonly string[];
}
const webUrl = z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol));
export const modelProviderConnectionSchema = z.strictObject({
  protocol: z.enum(["openai-responses", "openai-chat", "anthropic"]),
  baseUrl: webUrl, auth: z.enum(["api_key", "none"]),
  compatibility: z.array(z.strictObject({ id: z.string().min(1), value: jsonSchema.optional() })),
  usage: providerUsageIdSchema.nullable().optional(),
  fixedFields: z.array(z.enum(modelProviderFixedFields)).optional(),
});
export const modelProviderPresetSchema = z.strictObject({
  id: z.string().trim().min(1).max(160).regex(/^[^/\s]+$/u), name: z.string().trim().min(1).max(160),
  billing: z.enum(["usage", "subscription", "none"]), region: uiTextSchema.optional(), plan: uiTextSchema.optional(),
  connection: modelProviderConnectionSchema, keyUrl: webUrl.optional(),
  sources: z.tuple([webUrl]).rest(webUrl), verifiedOn: z.iso.date(), keywords: z.array(z.string()).optional(),
});
/** patch overrides only explicit fields; connection merges by field, arrays are replaced as a whole, and saved connections are not rewritten. */
export type ModelProviderPresetContribution =
  | { type: "add"; preset: ModelProviderPreset }
  | { type: "patch"; id: string; patch: Partial<Omit<ModelProviderPreset, "id" | "connection">> & { connection?: Partial<ModelProviderConnection> } };

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
