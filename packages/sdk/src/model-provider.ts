import { z } from "zod";
import { uiTextSchema, type UiText } from "./i18n.ts";
import { jsonSchema, type Json } from "./json.ts";
import { providerUsageIdSchema } from "./provider-usage.ts";

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
