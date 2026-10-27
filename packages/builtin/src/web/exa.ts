import { z } from "zod";
import { Exa, ExaError, type ApiWarning, type SearchNotice } from "exa-js";
import { jsonSchema, present, webUrlSchema, type WebDocument, type WebHint, type WebResponse, type WebSearchRequest } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { builtin } from "@asterism-app/builtin-api/contracts";

const MAX_TEXT_CHARACTERS = 1_000_000;

const resultSchema = z.object({
  id: z.string().optional(), url: webUrlSchema, title: z.string().nullish(), author: z.string().nullish(),
  publishedDate: z.string().nullish(), text: z.string().optional(), highlights: z.array(z.string()).optional(),
  summary: jsonSchema.optional(), score: z.number().optional(), image: z.string().nullish(), favicon: z.string().nullish(),
}).catchall(jsonSchema);
const responseSchema = z.object({
  results: z.array(resultSchema), requestId: z.string().optional(),
  costDollars: z.object({ total: z.number() }).catchall(jsonSchema).optional(),
  statuses: z.array(z.object({ id: z.string(), status: z.string(), error: jsonSchema.optional().nullable() }).catchall(jsonSchema)).optional(),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), path: z.string().optional() }).catchall(jsonSchema)).optional(),
  notices: z.array(z.object({ code: z.string(), message: z.string(), path: z.string().optional() }).catchall(jsonSchema)).optional(),
}).catchall(jsonSchema);
/** Exa-specific fields retain their original meanings; webDocumentSchema consistently interprets shared fields. */
export const ExaDocumentDetails = builtin.data("web.exa.document", z.object({ id: z.string().optional(), snapshotAt: z.string().optional(),
  highlightScores: z.array(z.number()).optional(), entities: z.array(jsonSchema).optional(), extras: jsonSchema.optional(),
}).catchall(jsonSchema));
export const ExaResponseDetails = builtin.data("web.exa.response", z.object({
  costDollars: jsonSchema.optional(), statuses: jsonSchema.optional(), resolvedSearchType: z.string().optional(),
  searchTime: z.number().optional(), output: jsonSchema.optional(),
}).catchall(jsonSchema));
const hintParameter: Record<string, string> = {
  query: "query", includeDomains: "includeDomains", excludeDomains: "excludeDomains",
  startPublishedDate: "publishedAfter", endPublishedDate: "publishedBefore", numResults: "maxResults",
  userLocation: "region", "userLocation/country": "region",
  "text/maxCharacters": "maxCharacters", "contents/text/maxCharacters": "maxCharacters", "highlights/query": "query",
};
type Diagnostic = Pick<ApiWarning | SearchNotice, "code" | "message"> & { path?: string };

function mapDiagnostic(note: Diagnostic): WebHint {
  const field = note.path?.replace(/^\//u, "");
  const parameter = field ? hintParameter[field] : undefined;
  if (note.code === "IGNORED_FIELD") return {
    code: "unsupported_parameter",
    message: parameter ? `Exa did not apply the requested ${parameter} parameter.` : note.message,
    ...(parameter && { parameter }),
  };
  if (note.code === "RESTRICTIONS_RELAXED") return {
    code: "restrictions_relaxed", message: note.message, ...(parameter && { parameter }),
  };
  return { code: note.code, message: note.message, ...(parameter && { parameter }) };
}

export function exaError(error: unknown): unknown {
  // SDK cancellation and unknown exceptions retain their identity.
  if (!(error instanceof ExaError)) return error;
  const context = [`HTTP ${error.statusCode}`, error.type, error.code, error.requestId && `requestId: ${error.requestId}`].filter(Boolean).join(", ");
  const detail = error.detail === undefined ? "" : ` Details: ${JSON.stringify(error.detail)}`;
  const result = new WebError(error.statusCode === 400 || error.statusCode === 422 ? "invalid_request" : "request_failed",
    `Exa request failed (${context}): ${error.message}${detail}`);
  result.cause = error;
  return result;
}

async function exaRequest<T>(request: Promise<T>): Promise<T> {
  try { return await request; }
  catch (error) { throw exaError(error); }
}

function mapDocument(result: z.infer<typeof resultSchema>): WebDocument {
  const { url, title, author, publishedDate, text, highlights, summary, score, image, favicon, ...extra } = result;
  const content: WebDocument["content"] = [];
  if (text !== undefined) content.push({ kind: "body", format: "text", text });
  for (const h of highlights ?? []) content.push({ kind: "excerpt", format: "text", text: h });
  if (summary !== undefined) {
    content.push({ kind: "summary", format: "text", text: typeof summary === "string" ? summary : JSON.stringify(summary) });
    if (typeof summary !== "string") extra.summary = summary;
  }
  const media: { image?: string; favicon?: string } = {};
  for (const [key, value] of [["image", image], ["favicon", favicon]] as const) if (value != null) {
    if (webUrlSchema.safeParse(value).success) media[key] = value;
    else extra[key] = value;
  }
  return { url, ...(title != null && { title }), ...(author != null && { author }), content,
    ...(publishedDate && { dates: [{ kind: "published" as const, value: publishedDate }] }),
    ...(score !== undefined && { score }), ...media, details: [present(ExaDocumentDetails, extra)] };
}

function mapHints(
  warnings: readonly Diagnostic[] | undefined,
  notices: readonly Diagnostic[] | undefined,
  statuses: readonly { id: string; status: string; error?: unknown }[] | undefined,
  leading: WebHint[]): WebHint[] {
  const notes: WebHint[] = [...leading, ...[...warnings ?? [], ...notices ?? []].map(mapDiagnostic)];
  for (const status of statuses ?? []) if (status.status !== "success") notes.push({ code: "content_unavailable",
    message: `Content retrieval for ${status.id} reported ${status.status}${status.error ? `: ${JSON.stringify(status.error)}` : "."}` });
  return notes;
}

export function exaResponse(raw: unknown, leadingHints: WebHint[] = []): WebResponse {
  const { results, requestId, ...details } = responseSchema.parse(raw);
  const { warnings, notices, statuses, costDollars } = details;
  return {
    documents: results.map(mapDocument),
    hints: mapHints(warnings, notices, statuses, leadingHints),
    ...(requestId && { requestId }),
    ...(costDollars && { usage: [{ name: "total", amount: costDollars.total, unit: "currency", currency: "USD" }] }),
    details: [present(ExaResponseDetails, details)],
  };
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
  id: "exa", label: "Exa", search: true, fetch: true, urlPatterns: ["*"],
  defaultBaseUrl: "https://api.exa.ai",
  credential: { kind: "api_key", keyUrl: "https://dashboard.exa.ai/api-keys" },
  create({ baseUrl, credential }) {
    if (!credential) throw new WebError("credential_unavailable", "An Exa API key is required.");
    const client = new Exa(credential, baseUrl, { warnings: "silent" });
    return {
      async search(request, { signal }) {
        const { options, hints } = exaSearchOptions(request);
        return exaResponse(await exaRequest(client.search(request.query, options, { signal })), hints);
      },
      async fetch(request, { signal }) {
        const maxCharacters = request.maxCharacters === undefined ? undefined : Math.min(request.maxCharacters, MAX_TEXT_CHARACTERS);
        const hints: WebHint[] = [];
        if (maxCharacters !== request.maxCharacters) {
          hints.push({ code: "parameter_adjusted", parameter: "maxCharacters", message: `Exa accepts at most ${MAX_TEXT_CHARACTERS} body characters per page; the requested maximum was reduced to ${MAX_TEXT_CHARACTERS}.` });
        }
        const response = exaResponse(await exaRequest(client.getContents([request.url], {
          text: maxCharacters === undefined ? true : { maxCharacters },
          ...(request.query && { highlights: { query: request.query } }), filterEmptyResults: false,
        }, { signal })), hints);
        if (!response.documents.length) throw new WebError("request_failed", response.hints.map(hint => hint.message).join("\n") || "Exa returned no content for this URL.");
        return response;
      },
    };
  },
};
