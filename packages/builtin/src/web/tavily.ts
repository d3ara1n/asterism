import { z } from "zod";
import { jsonSchema, present, webUrlSchema, type WebDocument, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { webMessages as messages } from "../messages/web.ts";
import { postWebJson } from "./http.ts";
import { searchDate, searchResultLimit } from "./search-options.ts";
import { tavilyCountries } from "./tavily-countries.ts";
import { parseWebResponse } from "./response.ts";

const BASE_URL = "https://api.tavily.com";
const resultSchema = z.object({
  url: webUrlSchema, title: z.string().nullish(), content: z.string().nullish(), raw_content: z.string().nullish(),
  score: z.number().optional(), published_date: z.string().nullish(), favicon: z.string().nullish(),
}).catchall(jsonSchema);
const responseSchema = z.object({
  results: z.array(resultSchema), request_id: z.string().optional(),
  failed_results: z.array(z.object({ url: z.string(), error: z.string() }).catchall(jsonSchema)).optional(),
  usage: z.object({ credits: z.number() }).catchall(jsonSchema).optional(),
}).catchall(jsonSchema);
export const TavilyDocumentDetails = builtin.data("web.tavily.document", z.object({}).catchall(jsonSchema));
export const TavilyResponseDetails = builtin.data("web.tavily.response", z.object({}).catchall(jsonSchema));

export function tavilySearchOptions(request: WebSearchRequest, depth = "basic") {
  const hints: WebHint[] = [];
  const country = request.region ? tavilyCountries[request.region] : undefined;
  if (request.region && !country) hints.push({ code: "unsupported_parameter", parameter: "region",
    message: `Tavily does not support the requested country ${request.region}.` });
  const start = searchDate("Tavily", request.publishedAfter, "publishedAfter", hints);
  const end = searchDate("Tavily", request.publishedBefore, "publishedBefore", hints);
  if (start || end) hints.push({ code: "parameter_adjusted", parameter: start ? "publishedAfter" : "publishedBefore",
    message: "Tavily filters by its estimated publication or update date, which may differ from the original publication date." });
  return { hints, options: {
    query: request.query, search_depth: depth, topic: "general", max_results: searchResultLimit("Tavily", request.maxResults, 20, hints),
    include_domains: request.includeDomains, exclude_domains: request.excludeDomains,
    start_date: start, end_date: end, filter_by_published_date: !!(start || end), include_published_date: true,
    language: request.language, country, include_answer: false, include_raw_content: false, include_usage: true,
  } };
}

/** A focused extraction returns ranked chunks in raw_content; ordinary extraction returns a page body. */
export function tavilyResponse(raw: unknown, mode: "search" | "body" | "excerpt", leadingHints: WebHint[] = []): WebResponse {
  const { results, request_id, ...details } = parseWebResponse("Tavily", responseSchema, raw);
  return {
    documents: results.map(({ url, title, content: excerpt, raw_content, score, published_date, favicon, ...extra }) => {
      const content: WebDocument["content"] = [];
      if (excerpt != null) content.push({ kind: "excerpt", format: "text", text: excerpt });
      if (raw_content != null) content.push({ kind: mode === "excerpt" ? "excerpt" : "body", format: "markdown", text: raw_content });
      const icon = webUrlSchema.safeParse(favicon);
      if (favicon != null && !icon.success) extra.favicon = favicon;
      return { url, ...(title != null && { title }), content,
        ...(score !== undefined && { score }), ...(icon.success && { favicon: icon.data }),
        ...(published_date && { dates: [{ kind: "unknown" as const, value: published_date }] }),
        details: [present(TavilyDocumentDetails, extra)],
      };
    }),
    hints: [...leadingHints, ...(details.failed_results?.map(failure => ({ code: "content_unavailable",
      message: `Content retrieval for ${failure.url} failed: ${failure.error}` })) ?? [])],
    ...(request_id && { requestId: request_id }),
    ...(details.usage && { usage: [{ name: mode === "search" ? "search" : mode === "body" ? "extract" : "excerpts", amount: details.usage.credits, unit: "credits" }] }),
    details: [present(TavilyResponseDetails, { operation: mode, ...(request_id && { request_id }), ...details })],
  };
}

export const tavilyWebProvider: WebProviderDefinition = {
  id: "tavily", label: "Tavily", search: true, fetch: true, urlPatterns: ["*"],
  settings: [
    { kind: "secret", key: "apiKey", label: messages.apiKey, required: true, helpUrl: "https://app.tavily.com" },
    { kind: "choice", key: "searchDepth", label: messages.tavilySearchDepth, description: messages.tavilySearchDepthHint, default: "basic", options: [
      { value: "basic", label: messages.tavilyBasic }, { value: "advanced", label: messages.tavilyAdvanced },
    ] },
    { kind: "choice", key: "extractDepth", label: messages.tavilyExtractDepth, description: messages.tavilyExtractDepthHint, default: "basic", options: [
      { value: "basic", label: messages.tavilyBasic }, { value: "advanced", label: messages.tavilyAdvanced },
    ] },
  ],
  create({ settings }) {
    return {
      async search(request, { signal }) {
        const { options, hints } = tavilySearchOptions(request, settings.searchDepth);
        return tavilyResponse(await postWebJson("Tavily", `${BASE_URL}/search`, settings.apiKey!, options, signal), "search", hints);
      },
      async fetch(request, { signal }) {
        const body = { urls: [request.url], format: "markdown", extract_depth: settings.extractDepth, include_usage: true };
        const result = tavilyResponse(await postWebJson("Tavily", `${BASE_URL}/extract`, settings.apiKey!, body, signal), "body");
        if (!result.documents.some(document => document.content.some(part => part.kind === "body" && part.text.trim())))
          throw new WebError("request_failed", result.hints.map(hint => hint.message).join("\n") || "Tavily returned no page body for this URL.");
        if (request.query) {
          const focused = tavilyResponse(await postWebJson("Tavily", `${BASE_URL}/extract`, settings.apiKey!, { ...body, query: request.query }, signal), "excerpt");
          for (const document of focused.documents) {
            const target = result.documents.find(item => item.url === document.url);
            if (target) {
              target.content.push(...document.content);
              target.details = [...(target.details ?? []), ...(document.details ?? [])];
            } else result.documents.push(document);
          }
          result.hints.push(...focused.hints);
          result.usage = [...(result.usage ?? []), ...(focused.usage ?? [])];
          result.details = [...(result.details ?? []), ...(focused.details ?? [])];
        }
        return result;
      },
    };
  },
};
