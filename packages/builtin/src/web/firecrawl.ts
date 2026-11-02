import { z } from "zod";
import { jsonSchema, present, webUrlSchema, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { webMessages as messages } from "../messages/web.ts";
import { postWebJson } from "./http.ts";
import { exclusiveDomains, monthFirstDate, searchDate, searchResultLimit } from "./search-options.ts";
import { parseWebResponse } from "./response.ts";

const BASE_URL = "https://api.firecrawl.dev/v2";
const envelopeSchema = z.object({
  success: z.boolean(), data: jsonSchema.optional(), error: z.string().optional(), warning: z.string().nullish(),
  id: z.string().optional(), creditsUsed: z.number().optional(),
}).catchall(jsonSchema);
const searchSchema = z.object({ web: z.array(z.object({ url: webUrlSchema, title: z.string().nullish(), description: z.string().nullish() }).catchall(jsonSchema)) }).catchall(jsonSchema);
const scrapeSchema = z.object({ markdown: z.string().optional(), metadata: z.object({
  title: z.string().nullish(), url: z.string().optional(), sourceURL: z.string().optional(),
  statusCode: z.number().optional(), error: z.string().nullish(),
}).catchall(jsonSchema).optional() }).catchall(jsonSchema);
export const FirecrawlDocumentDetails = builtin.data("web.firecrawl.document", z.object({}).catchall(jsonSchema));
export const FirecrawlResponseDetails = builtin.data("web.firecrawl.response", z.object({}).catchall(jsonSchema));

export function firecrawlSearchOptions(request: WebSearchRequest) {
  const hints: WebHint[] = [];
  const { includes, excludes } = exclusiveDomains("Firecrawl", request, hints);
  if (request.language) hints.push({ code: "unsupported_parameter", parameter: "language", message: "Firecrawl did not apply the requested language preference." });
  const after = monthFirstDate(searchDate("Firecrawl", request.publishedAfter, "publishedAfter", hints));
  const before = monthFirstDate(searchDate("Firecrawl", request.publishedBefore, "publishedBefore", hints));
  if (after || before) hints.push({ code: "parameter_adjusted", parameter: after ? "publishedAfter" : "publishedBefore",
    message: "Firecrawl uses a search-engine time range rather than a guaranteed publication-date filter." });
  return { hints, options: {
    query: request.query, limit: searchResultLimit("Firecrawl", request.maxResults, 100, hints), sources: ["web"],
    includeDomains: includes, excludeDomains: excludes, country: request.region,
    tbs: after || before ? ["cdr:1", after && `cd_min:${after}`, before && `cd_max:${before}`].filter(Boolean).join(",") : undefined,
  } };
}

function firecrawlEnvelope(raw: unknown, leadingHints: WebHint[]) {
  const { success, data, id, ...details } = parseWebResponse("Firecrawl", envelopeSchema, raw);
  if (!success) throw new WebError("request_failed", `Firecrawl request failed: ${JSON.stringify(details)}`);
  const response = {
    hints: [...leadingHints, ...(details.warning ? [{ code: "provider_warning", message: details.warning }] : [])],
    ...(id && { requestId: id }),
    ...(details.creditsUsed !== undefined && { usage: [{ name: "credits", amount: details.creditsUsed, unit: "credits" }] }),
    details: [present(FirecrawlResponseDetails, details)],
  } satisfies Omit<WebResponse, "documents">;
  return { data, response };
}

export function firecrawlSearchResponse(raw: unknown, hints: WebHint[] = []): WebResponse {
  const { data, response } = firecrawlEnvelope(raw, hints);
  const { web, ...extra } = parseWebResponse("Firecrawl", searchSchema, data);
  return {
    ...response,
    details: [...response.details, present(FirecrawlResponseDetails, extra)],
    documents: web.map(({ url, title, description, ...details }) => ({
      url, ...(title != null && { title }), content: description == null ? [] : [{ kind: "snippet", format: "text", text: description }],
      details: [present(FirecrawlDocumentDetails, details)],
    })),
  };
}

export function firecrawlFetchResponse(raw: unknown, requestedUrl: string, query?: string): WebResponse {
  const { data, response } = firecrawlEnvelope(raw, query ? [{ code: "unsupported_parameter", parameter: "query",
    message: "Firecrawl does not provide focused excerpts alongside the page body." }] : []);
  const { markdown, metadata, ...extra } = parseWebResponse("Firecrawl", scrapeSchema, data);
  if (metadata?.error || (metadata?.statusCode !== undefined && metadata.statusCode >= 400))
    throw new WebError("request_failed", `Firecrawl could not retrieve the page (HTTP ${metadata?.statusCode ?? "unknown"}): ${metadata?.error ?? "Page request failed."}`);
  if (!markdown?.trim()) throw new WebError("request_failed", "Firecrawl returned no page body for this URL.");
  const finalUrl = webUrlSchema.safeParse(metadata?.url);
  return {
    ...response,
    documents: [{ url: finalUrl.success ? finalUrl.data : requestedUrl, ...(metadata?.title != null && { title: metadata.title }),
      content: [{ kind: "body", format: "markdown", text: markdown }],
      details: [present(FirecrawlDocumentDetails, { ...extra, ...(metadata && { metadata }) })],
    }],
  };
}

export const firecrawlWebProvider: WebProviderDefinition = {
  id: "firecrawl", label: "Firecrawl", search: true, fetch: true, urlPatterns: ["*"],
  settings: [{ kind: "secret", key: "apiKey", label: messages.apiKey, required: true, helpUrl: "https://www.firecrawl.dev/app/api-keys" }],
  create({ settings }) {
    return {
      async search(request, { signal }) {
        const { options, hints } = firecrawlSearchOptions(request);
        return firecrawlSearchResponse(await postWebJson("Firecrawl", `${BASE_URL}/search`, settings.apiKey!, options, signal), hints);
      },
      async fetch(request, { signal }) {
        return firecrawlFetchResponse(await postWebJson("Firecrawl", `${BASE_URL}/scrape`, settings.apiKey!, {
          url: request.url, formats: ["markdown"], onlyMainContent: true,
        }, signal), request.url, request.query);
      },
    };
  },
};
