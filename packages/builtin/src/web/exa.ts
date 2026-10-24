import { z } from "zod";
import { Exa } from "exa-js";
import { jsonSchema, present, webUrlSchema, type WebDocument, type WebHint, type WebResponse, type WebSearchRequest } from "@atelier/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@atelier/sdk/runtime";
import { builtin } from "@atelier/builtin-api/contracts";

const settingsSchema = z.strictObject({});
const resultSchema = z.object({
  id: z.string().optional(), url: webUrlSchema, title: z.string().nullable().optional(), author: z.string().optional(),
  publishedDate: z.string().optional(), text: z.string().optional(), highlights: z.array(z.string()).optional(),
  summary: jsonSchema.optional(), score: z.number().optional(), image: z.string().optional(), favicon: z.string().optional(),
}).catchall(jsonSchema);
const responseSchema = z.object({
  results: z.array(resultSchema), requestId: z.string().optional(),
  costDollars: z.object({ total: z.number() }).catchall(jsonSchema).optional(),
  statuses: z.array(z.object({ id: z.string(), status: z.string(), error: jsonSchema.optional().nullable() }).catchall(jsonSchema)).optional(),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), path: z.string().optional() })).optional(),
  notices: z.array(z.object({ code: z.string(), message: z.string(), path: z.string().optional() }).catchall(jsonSchema)).optional(),
}).catchall(jsonSchema);
/** Exa 专属字段保留其原始含义，公共字段由 webDocumentSchema 统一解释。 */
export const ExaDocumentDetails = builtin.data("web.exa.document", z.object({ id: z.string().optional(), snapshotAt: z.string().optional(),
  highlightScores: z.array(z.number()).optional(), entities: z.array(jsonSchema).optional(), extras: jsonSchema.optional(),
}).catchall(jsonSchema));
export const ExaResponseDetails = builtin.data("web.exa.response", z.object({
  costDollars: jsonSchema.optional(), statuses: jsonSchema.optional(), resolvedSearchType: z.string().optional(),
  searchTime: z.number().optional(), output: jsonSchema.optional(),
}).catchall(jsonSchema));
const hintParameter: Record<string, string> = { startPublishedDate: "publishedAfter", endPublishedDate: "publishedBefore", numResults: "maxResults", userLocation: "region" };
export function exaResponse(raw: unknown, hints: WebHint[] = []): WebResponse {
  const { results, requestId, warnings, notices, ...details } = responseSchema.parse(raw);
  const documents: WebDocument[] = results.map(result => {
    const { url, title, author, publishedDate, text, highlights, summary, score, image, favicon, ...extra } = result;
    const content: WebDocument["content"] = [];
    if (text !== undefined) content.push({ kind: "body", format: "text", text });
    for (const text of highlights ?? []) content.push({ kind: "excerpt", format: "text", text });
    if (summary !== undefined) {
      content.push({ kind: "summary", format: "text", text: typeof summary === "string" ? summary : JSON.stringify(summary) });
      if (typeof summary !== "string") extra.summary = summary;
    }
    // 媒体链接格式不影响已取得正文；无法作为 HTTP 链接呈现的值保留在领域数据中。
    const media: { image?: string; favicon?: string } = {};
    for (const [key, value] of [["image", image], ["favicon", favicon]] as const) if (value !== undefined) {
      if (webUrlSchema.safeParse(value).success) media[key] = value;
      else extra[key] = value;
    }
    return { url, ...(title != null && { title }), ...(author !== undefined && { author }), content,
      ...(publishedDate && { dates: [{ kind: "published" as const, value: publishedDate }] }),
      ...(score !== undefined && { score }), ...media, details: [present(ExaDocumentDetails, extra)] };
  });
  const notes = [...hints, ...[...warnings ?? [], ...notices ?? []].map(note => {
    const field = note.path?.replace(/^\//u, "");
    return { code: note.code, message: note.message, ...(field && { parameter: hintParameter[field] ?? field }) };
  })];
  for (const status of details.statuses ?? []) if (status.status !== "success") notes.push({ code: "content_unavailable",
    message: `Content retrieval for ${status.id} reported ${status.status}${status.error ? `: ${JSON.stringify(status.error)}` : "."}` });
  return { documents, hints: notes, ...(requestId && { requestId }),
    ...(details.costDollars && { usage: [{ name: "total", amount: details.costDollars.total, unit: "currency", currency: "USD" }] }),
    details: [present(ExaResponseDetails, { ...details, ...(notices && { notices }), ...(warnings && { warnings }) })] };
}
export function exaSearchOptions(request: WebSearchRequest) {
  const hints: WebHint[] = [];
  if (request.language) hints.push({ code: "unsupported_parameter", parameter: "language", message: "Exa did not apply the requested language filter." });
  if (request.maxResults > 100) hints.push({ code: "parameter_adjusted", parameter: "maxResults", message: "Exa accepts at most 100 results; the requested maximum was reduced to 100." });
  return { hints, options: { type: "auto" as const, numResults: Math.min(request.maxResults, 100),
    includeDomains: request.includeDomains, excludeDomains: request.excludeDomains,
    startPublishedDate: request.publishedAfter, endPublishedDate: request.publishedBefore, userLocation: request.region,
    contents: { highlights: true as const },
  } };
}
export const exaWebProvider: WebProviderDefinition = {
  id: "exa", label: "Exa", search: true, fetch: true, urlPatterns: ["*"], settingsSchema,
  defaults: { baseUrl: "https://api.exa.ai", auth: "api_key", settings: {} }, keyUrl: "https://dashboard.exa.ai/api-keys",
  create({ connection, credential }) {
    if (!credential) throw new WebError("credential_unavailable", "An Exa API key is required.");
    const client = new Exa(credential, connection.baseUrl.replace(/\/+$/u, ""), { warnings: "silent" });
    return {
      async search(request, { signal }) {
        const { options, hints } = exaSearchOptions(request);
        return exaResponse(await client.search(request.query, options, { signal }), hints);
      },
      async fetch(request, { signal }) {
        const response = exaResponse(await client.getContents([request.url], {
          text: true, ...(request.query && { highlights: { query: request.query } }), filterEmptyResults: false,
        }, { signal }));
        if (!response.documents.length) throw new WebError("request_failed", response.hints.map(hint => hint.message).join("\n") || "Exa returned no content for this URL.");
        return response;
      },
    };
  },
};
