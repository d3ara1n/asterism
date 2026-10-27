import { z } from "zod";
import { presentationSchema } from "./presentation.ts";
import { uiTextSchema } from "./i18n.ts";

export const webUrlSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "An HTTP or HTTPS URL without embedded credentials is required.");
export const webHintSchema = z.object({ code: z.string(), message: z.string(), parameter: z.string().optional() });
export const webContentPartSchema = z.object({
  kind: z.enum(["snippet", "excerpt", "body", "summary"]), format: z.enum(["text", "markdown"]), text: z.string(),
  truncated: z.boolean().optional().describe("Known content truncation. Omitted when completeness is unknown."),
});
/** Dates retain upstream precision and kind; use unknown for an unknown date kind. */
export const webDateSchema = z.object({ kind: z.enum(["published", "modified", "fetched", "unknown"]), value: z.string() });
export const webDocumentSchema = z.object({
  url: webUrlSchema, title: z.string().optional(), author: z.string().optional(),
  dates: z.array(webDateSchema).optional(), content: z.array(webContentPartSchema),
  image: webUrlSchema.optional(), favicon: webUrlSchema.optional(),
  links: z.array(z.object({ url: webUrlSchema, title: z.string().optional() })).optional(),
  /** Scores are interpreted by the actual provider; consumers preserve result order. */
  score: z.number().finite().optional(), details: z.array(presentationSchema).optional(),
});
export const webUsageSchema = z.object({
  name: z.string(), amount: z.number().finite(), unit: z.string(), currency: z.string().optional(),
});
export const webResponseSchema = z.object({
  documents: z.array(webDocumentSchema), hints: z.array(webHintSchema),
  requestId: z.string().optional(), usage: z.array(webUsageSchema).optional(), details: z.array(presentationSchema).optional(),
});
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
export const webSearchRequestSchema = z.object({
  query: z.string().trim().min(1).describe("Web search query."),
  maxResults: z.number().int().positive().default(10).describe("Maximum number of search results."),
  includeDomains: z.array(z.string().trim().min(1)).optional().describe("Domains to include."),
  excludeDomains: z.array(z.string().trim().min(1)).optional().describe("Domains to exclude."),
  publishedAfter: date.optional().describe("Publication date lower bound, as an ISO date or timestamp."),
  publishedBefore: date.optional().describe("Publication date upper bound, as an ISO date or timestamp."),
  language: z.string().trim().min(1).optional().describe("Preferred content language."),
  region: z.string().regex(/^[A-Z]{2}$/u).optional().describe("Two-letter country code for localized results."),
}).describe("Search terms and optional filters. Result hints describe conditions that were not applied.");
export const webFetchRequestSchema = z.object({
  url: webUrlSchema.describe("URL to retrieve."),
  query: z.string().trim().min(1).optional().describe("Optional focus for additional excerpts delivered alongside the page body. Excerpt retrieval may incur additional provider charges."),
  maxCharacters: z.number().int().positive().optional().describe("Maximum body characters per document, counted as Unicode code points across body parts. Excerpts and metadata are separate. Omitted uses provider defaults."),
}).describe("URL, optional additional excerpt focus and body character limit.");

/** Providers declare credential types; the UI renders corresponding inputs by type and does not accept arbitrary JSON. */
export const webCredentialDefinitionSchema = z.object({
  kind: z.enum(["api_key"]),
  keyUrl: webUrlSchema.optional(),
});
/** At most one configuration per provider type; id equals the type slug. */
export const webProviderStateSchema = z.strictObject({
  id: z.string().trim().min(1),
  enabled: z.boolean(),
});
export const webProviderTypeSchema = z.object({
  id: z.string().min(1), label: uiTextSchema, owner: z.string(),
  search: z.boolean(), fetch: z.boolean(), urlPatterns: z.array(z.string().min(1)),
  credential: webCredentialDefinitionSchema.nullable(),
});
/** provider in results is the type slug of the provider that actually handled the request. */
export const webSearchResultSchema = webResponseSchema.extend({ query: z.string(), provider: z.string() });
export const webFetchResultSchema = webResponseSchema.extend({ requestedUrl: webUrlSchema, provider: z.string() });
export type WebHint = z.infer<typeof webHintSchema>;
export type WebDocument = z.infer<typeof webDocumentSchema>;
export type WebResponse = z.infer<typeof webResponseSchema>;
export type WebSearchRequest = z.infer<typeof webSearchRequestSchema>;
export type WebFetchRequest = z.infer<typeof webFetchRequestSchema>;
export type WebCredentialDefinition = z.infer<typeof webCredentialDefinitionSchema>;
export type WebProviderState = z.infer<typeof webProviderStateSchema>;
export type WebProviderType = z.infer<typeof webProviderTypeSchema>;
export type WebSearchResult = z.infer<typeof webSearchResultSchema>;
export type WebFetchResult = z.infer<typeof webFetchResultSchema>;
