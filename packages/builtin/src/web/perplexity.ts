import { z } from "zod";
import Perplexity, { APIError, type SearchCreateParams } from "@perplexity-ai/perplexity_ai";
import { jsonSchema, present, webUrlSchema, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { webMessages as messages } from "../messages/web.ts";
import { exclusiveDomains, monthFirstDate, searchDate, searchResultLimit } from "./search-options.ts";
import { parseWebResponse } from "./response.ts";

const resultSchema = z.object({
  url: webUrlSchema, title: z.string(), snippet: z.string(), date: z.string().nullish(), last_updated: z.string().nullish(),
}).catchall(jsonSchema);
const responseSchema = z.object({ id: z.string(), results: z.array(resultSchema) }).catchall(jsonSchema);
export const PerplexityDocumentDetails = builtin.data("web.perplexity.document", z.object({}).catchall(jsonSchema));
export const PerplexityResponseDetails = builtin.data("web.perplexity.response", z.object({}).catchall(jsonSchema));

export function perplexitySearchOptions(request: WebSearchRequest) {
  const hints: WebHint[] = [];
  const { includes, excludes } = exclusiveDomains("Perplexity", request, hints);
  const options: SearchCreateParams = {
    query: request.query, search_type: "web", max_results: searchResultLimit("Perplexity", request.maxResults, 20, hints),
    search_domain_filter: includes ?? excludes?.map(domain => `-${domain}`),
    search_language_filter: request.language ? [request.language] : undefined, country: request.region,
    search_after_date_filter: monthFirstDate(searchDate("Perplexity", request.publishedAfter, "publishedAfter", hints)),
    search_before_date_filter: monthFirstDate(searchDate("Perplexity", request.publishedBefore, "publishedBefore", hints)),
  };
  return { options, hints };
}

export function perplexityResponse(raw: unknown, hints: WebHint[] = []): WebResponse {
  const { id, results, ...details } = parseWebResponse("Perplexity", responseSchema, raw);
  return { requestId: id, hints, details: [present(PerplexityResponseDetails, details)],
    documents: results.map(({ url, title, snippet, date, last_updated, ...extra }) => ({
      url, title, content: [{ kind: "snippet" as const, format: "text" as const, text: snippet }],
      dates: [...(date ? [{ kind: "published" as const, value: date }] : []),
        ...(last_updated ? [{ kind: "modified" as const, value: last_updated }] : [])],
      details: [present(PerplexityDocumentDetails, extra)],
    })),
  };
}

export const perplexityWebProvider: WebProviderDefinition = {
  id: "perplexity", label: "Perplexity", search: true, fetch: false, urlPatterns: [],
  settings: [{ kind: "secret", key: "apiKey", label: messages.apiKey, required: true, helpUrl: "https://www.perplexity.ai/account/api/keys" }],
  create({ settings }) {
    const client = new Perplexity({ apiKey: settings.apiKey!, baseURL: "https://api.perplexity.ai" });
    return { async search(request, { signal }) {
      const { options, hints } = perplexitySearchOptions(request);
      try { return perplexityResponse(await client.search.create(options, { signal }), hints); }
      catch (cause) {
        // SDK cancellation and connection errors have no HTTP status and retain their identity.
        if (!(cause instanceof APIError) || cause.status === undefined) throw cause;
        const details = cause.error ? ` Details: ${JSON.stringify(cause.error)}` : "";
        const error = new WebError(cause.status === 400 || cause.status === 422 ? "invalid_request" : "request_failed",
          `Perplexity request failed (HTTP ${cause.status}): ${cause.message}${details}`);
        error.cause = cause;
        throw error;
      }
    } };
  },
};
