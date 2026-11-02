import { z } from "zod";
import { jsonSchema, present, webUrlSchema, type WebDocument, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { webMessages as messages } from "../messages/web.ts";
import { postWebJson } from "./http.ts";
import { searchDate, searchResultLimit } from "./search-options.ts";
import { parseWebResponse } from "./response.ts";

const BASE_URL = "https://api.deepseek.com/v1/tools";
const resultSchema = z.object({
  url: webUrlSchema, title: z.string(), snippet: z.string(), summary: z.string(), content: z.string(),
  rerank_score: z.number(), site_icon: z.string().nullish(), date: z.string().nullish(),
}).catchall(jsonSchema);
const searchSchema = z.object({ results: z.array(resultSchema) }).catchall(jsonSchema);
const fetchSchema = z.object({ title: z.string(), content: z.string() }).catchall(jsonSchema);
export const DeepSeekDocumentDetails = builtin.data("web.deepseek.document", z.object({}).catchall(jsonSchema));
export const DeepSeekResponseDetails = builtin.data("web.deepseek.response", z.object({}).catchall(jsonSchema));

export function deepseekSearchOptions(request: WebSearchRequest) {
  const hints: WebHint[] = [];
  if (request.region) hints.push({ code: "unsupported_parameter", parameter: "region",
    message: "DeepSeek accepts IP-based localization, not a country preference; region was not applied." });
  const after = searchDate("DeepSeek", request.publishedAfter, "publishedAfter", hints);
  const before = searchDate("DeepSeek", request.publishedBefore, "publishedBefore", hints);
  const query = [request.query, request.includeDomains?.map(domain => `site:${domain}`).join(" OR "),
    ...(request.excludeDomains?.map(domain => `-site:${domain}`) ?? []),
    request.language && `lang:${request.language}`, after && `after:${after}`, before && `before:${before}`,
  ].filter(Boolean).join(" ");
  return { hints, options: { query, count: searchResultLimit("DeepSeek", request.maxResults, 50, hints), need_content: false } };
}

export function deepseekSearchResponse(raw: unknown, hints: WebHint[] = []): WebResponse {
  const { results, ...details } = parseWebResponse("DeepSeek", searchSchema, raw);
  return { hints, details: [present(DeepSeekResponseDetails, details)],
    documents: results.map(({ url, title, snippet, summary, content: body, rerank_score, site_icon, date, ...extra }) => {
      const content: WebDocument["content"] = [];
      if (snippet) content.push({ kind: "snippet", format: "text", text: snippet });
      if (summary) content.push({ kind: "summary", format: "text", text: summary });
      if (body) content.push({ kind: "body", format: "text", text: body });
      const favicon = webUrlSchema.safeParse(site_icon);
      if (site_icon != null && !favicon.success) extra.site_icon = site_icon;
      return { url, title, content, score: rerank_score,
        ...(date && { dates: [{ kind: "published" as const, value: date }] }),
        ...(favicon.success && { favicon: favicon.data }), details: [present(DeepSeekDocumentDetails, extra)],
      };
    }),
  };
}

export function deepseekFetchResponse(raw: unknown, url: string, query?: string): WebResponse {
  const { title, content, ...details } = parseWebResponse("DeepSeek", fetchSchema, raw);
  if (!content.trim()) throw new WebError("request_failed", "DeepSeek returned no page body for this URL.");
  return { documents: [{ url, title, content: [{ kind: "body", format: "markdown", text: content }] }],
    hints: query ? [{ code: "unsupported_parameter", parameter: "query", message: "DeepSeek does not provide focused excerpts alongside the page body." }] : [],
    details: [present(DeepSeekResponseDetails, details)],
  };
}

export const deepseekWebProvider: WebProviderDefinition = {
  id: "deepseek", label: "DeepSeek", search: true, fetch: true, urlPatterns: ["*"],
  settings: [{ kind: "secret", key: "apiKey", label: messages.apiKey, required: true, helpUrl: "https://platform.deepseek.com/api_keys" }],
  create({ settings }) {
    return {
      async search(request, { signal }) {
        const { options, hints } = deepseekSearchOptions(request);
        return deepseekSearchResponse(await postWebJson("DeepSeek", `${BASE_URL}/search`, settings.apiKey!, options, signal), hints);
      },
      async fetch(request, { signal }) {
        return deepseekFetchResponse(await postWebJson("DeepSeek", `${BASE_URL}/fetch`, settings.apiKey!, { url: request.url }, signal), request.url, request.query);
      },
    };
  },
};
