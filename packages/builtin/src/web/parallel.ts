import { z } from "zod";
import Parallel from "parallel-web";
import { jsonSchema, present, webUrlSchema, type WebDocument, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";

const resultSchema = z.object({
  url: webUrlSchema, title: z.string().nullish(), publish_date: z.string().nullish(),
  excerpts: z.array(z.string()), full_content: z.string().nullish(),
}).catchall(jsonSchema);
const responseSchema = z.object({
  results: z.array(resultSchema), search_id: z.string().optional(), extract_id: z.string().optional(),
  usage: z.array(z.object({ name: z.string(), count: z.number() }).catchall(jsonSchema)).nullish(),
  warnings: z.array(z.object({ type: z.string(), message: z.string() }).catchall(jsonSchema)).nullish(),
  errors: z.array(z.object({ url: z.string(), error_type: z.string(), http_status_code: z.number().nullish() }).catchall(jsonSchema)).nullish(),
}).catchall(jsonSchema);
export const ParallelDocumentDetails = builtin.data("web.parallel.document", z.object({}).catchall(jsonSchema));
export const ParallelResponseDetails = builtin.data("web.parallel.response", z.object({
  session_id: z.string().optional(), usage: jsonSchema.optional(), warnings: jsonSchema.optional(), errors: jsonSchema.optional(),
}).catchall(jsonSchema));

function mapDocument(result: z.infer<typeof resultSchema>): WebDocument {
  const { url, title, publish_date, excerpts, full_content, ...extra } = result;
  const content: WebDocument["content"] = [];
  if (full_content != null) content.push({ kind: "body", format: "markdown", text: full_content });
  for (const text of excerpts) content.push({ kind: "excerpt", format: "markdown", text });
  return { url, ...(title != null && { title }), content,
    ...(publish_date && { dates: [{ kind: "published" as const, value: publish_date }] }),
    details: [present(ParallelDocumentDetails, extra)],
  };
}

export function parallelResponse(raw: unknown, leadingHints: WebHint[] = []): WebResponse {
  const { results, search_id, extract_id, ...details } = responseSchema.parse(raw);
  const requestId = search_id ?? extract_id;
  return {
    documents: results.map(mapDocument),
    hints: [...leadingHints,
      ...(details.warnings ?? []).map(warning => ({ code: warning.type, message: warning.message })),
      ...(details.errors ?? []).map(error => ({ code: "content_unavailable",
        message: `Content retrieval for ${error.url} reported ${error.error_type}${error.http_status_code == null ? "." : ` (HTTP ${error.http_status_code}).`}` })),
    ],
    ...(requestId && { requestId }),
    // SKU counts report usage; absent prices are not estimated.
    ...(details.usage != null && { usage: details.usage.map(item => ({ name: item.name, amount: item.count, unit: "count" })) }),
    details: [present(ParallelResponseDetails, details)],
  };
}

export function parallelSearchOptions(request: WebSearchRequest) {
  const hints: WebHint[] = [];
  if (request.language) hints.push({ code: "unsupported_parameter", parameter: "language", message: "Parallel did not apply the requested language filter." });
  if (request.publishedBefore) hints.push({ code: "unsupported_parameter", parameter: "publishedBefore", message: "Parallel did not apply the requested publication date upper bound." });
  if (request.maxResults > 20) hints.push({ code: "parameter_adjusted", parameter: "maxResults", message: "Parallel accepts at most 20 results; the requested maximum was reduced to 20." });
  const hasIncludes = !!request.includeDomains?.length;
  if (hasIncludes && request.excludeDomains?.length) hints.push({ code: "unsupported_parameter", parameter: "excludeDomains", message: "Parallel ignores excluded domains when included domains are specified." });
  // The API accepts dates only; report the broader UTC date boundary for timestamps.
  const afterDate = request.publishedAfter?.includes("T") ? new Date(request.publishedAfter).toISOString().slice(0, 10) : request.publishedAfter;
  if (afterDate !== request.publishedAfter) hints.push({ code: "parameter_adjusted", parameter: "publishedAfter", message: `Parallel applies publication dates at day precision; the lower bound was reduced to ${afterDate} (UTC).` });
  const options: Parallel.SearchParams = {
    search_queries: [request.query],
    advanced_settings: {
      max_results: Math.min(request.maxResults, 20), location: request.region?.toLowerCase(),
      source_policy: { include_domains: request.includeDomains, exclude_domains: hasIncludes ? undefined : request.excludeDomains, after_date: afterDate },
    },
  };
  return { options, hints };
}

export const parallelWebProvider: WebProviderDefinition = {
  id: "parallel", label: "Parallel", search: true, fetch: true, urlPatterns: ["*"],
  defaultBaseUrl: "https://api.parallel.ai",
  credential: { kind: "api_key", keyUrl: "https://platform.parallel.ai" },
  create({ baseUrl, credential }) {
    if (!credential) throw new WebError("credential_unavailable", "A Parallel API key is required.");
    const client = new Parallel({ apiKey: credential, baseURL: baseUrl });
    return {
      async search(request, { signal }) {
        const { options, hints } = parallelSearchOptions(request);
        return parallelResponse(await client.search(options, { signal }), hints);
      },
      async fetch(request, { signal }) {
        const response = parallelResponse(await client.extract({
          urls: [request.url], ...(request.query && { objective: request.query }),
          advanced_settings: { full_content: request.maxCharacters === undefined ? true : { max_chars_per_result: request.maxCharacters } },
        }, { signal }));
        if (!response.documents.some(document => document.content.some(part => part.kind === "body")))
          throw new WebError("request_failed", response.hints.map(hint => hint.message).join("\n") || "Parallel returned no page body for this URL.");
        return response;
      },
    };
  },
};
