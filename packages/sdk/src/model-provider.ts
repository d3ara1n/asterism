import { z } from "zod";
import { uiTextSchema, type UiText } from "./i18n.ts";
import { jsonSchema, type Json } from "./json.ts";
import { providerUsageIdSchema } from "./provider-usage.ts";
import { providerIconIdSchema } from "./provider-icon.ts";

/** Host-owned model wire protocols; plugins select one and cannot register their own. */
export const languageModelProtocolIds = ["openai-responses", "openai-chat", "anthropic"] as const;
export type LanguageModelProtocolId = typeof languageModelProtocolIds[number];
export const languageModelProviderFixedFields = ["protocol", "baseUrl", "auth", "compatibility", "usage"] as const;
export interface LanguageModelProviderConnection {
  protocol: LanguageModelProtocolId;
  baseUrl: string;
  auth: "api_key" | "none";
  compatibility: { id: string; value?: Json }[];
  usage?: string | null;
  fixedFields?: (typeof languageModelProviderFixedFields)[number][];
}
export interface LanguageModelProviderPreset {
  id: string;
  /** Provider or product brand; region, plan, billing, and protocol distinctions remain separate from the name. */
  name: string;
  iconId?: string;
  billing: "usage" | "subscription" | "none";
  region?: UiText;
  plan?: UiText;
  connection: LanguageModelProviderConnection;
  keyUrl?: string;
  sources: readonly [string, ...string[]];
  verifiedOn: string;
  keywords?: readonly string[];
}
const webUrl = z.url({ protocol: /^https?$/ });
export const languageModelProviderConnectionSchema = z.strictObject({
  protocol: z.enum(languageModelProtocolIds),
  baseUrl: webUrl, auth: z.enum(["api_key", "none"]),
  compatibility: z.array(z.strictObject({ id: z.string().min(1), value: jsonSchema.optional() })),
  usage: providerUsageIdSchema.nullable().optional(),
  fixedFields: z.array(z.enum(languageModelProviderFixedFields)).optional(),
});
export const languageModelProviderPresetSchema = z.strictObject({
  id: z.string().trim().min(1).max(160).regex(/^[^/\s]+$/u), name: z.string().trim().min(1).max(160), iconId: providerIconIdSchema.optional(),
  billing: z.enum(["usage", "subscription", "none"]), region: uiTextSchema.optional(), plan: uiTextSchema.optional(),
  connection: languageModelProviderConnectionSchema, keyUrl: webUrl.optional(),
  sources: z.tuple([webUrl]).rest(webUrl), verifiedOn: z.iso.date(), keywords: z.array(z.string()).optional(),
});
/** patch overrides only explicit fields; connection merges by field, arrays are replaced as a whole, and saved connections are not rewritten. */
export type LanguageModelProviderPresetContribution =
  | { type: "add"; preset: LanguageModelProviderPreset }
  | { type: "patch"; id: string; patch: Partial<Omit<LanguageModelProviderPreset, "id" | "connection">> & { connection?: Partial<LanguageModelProviderConnection> } };
