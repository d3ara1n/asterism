import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ExaAbortError, ExaError, ExaTimeoutError } from "exa-js";
import { exaError, exaResponse, exaSearchOptions, exaWebProvider } from "./exa.ts";

// The SDK captures fetch when the module loads; replace it beforehand to keep request validation local.
const http = vi.hoisted(() => {
  const original = globalThis.fetch, transport = vi.fn<typeof fetch>();
  globalThis.fetch = transport;
  return { original, transport };
});
afterEach(() => http.transport.mockReset());
afterAll(() => { globalThis.fetch = http.original; });

describe("Exa result normalization", () => {
  // The registry strips trailing slashes before calling create; verify that proxy addresses without trailing slashes route correctly to search and contents paths.
  it("requests the correct search and contents paths under a proxy endpoint", async () => {
    const paths: string[] = [];
    http.transport.mockImplementation(async url => {
      paths.push(new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).pathname);
      return new Response(JSON.stringify({ results: [{ id: "page", url: "https://page.test/", text: "Page content" }] }),
        { headers: { "content-type": "application/json" } });
    });
    const instance = exaWebProvider.create({ baseUrl: "https://proxy.test/exa", credential: "test-key" });
    const options = { signal: new AbortController().signal };
    await instance.search!({ query: "test", maxResults: 1 }, options);
    await instance.fetch!({ url: "https://page.test/" }, options);
    expect(paths).toEqual(["/exa/search", "/exa/contents"]);
  });
  // Default fetching should retain the body request; query only adds excerpts, and character limits must also adapt to Exa's own parameter range.
  it("selects body options and additional excerpts from fetch arguments and explicitly reports adjustments to upstream limits", async () => {
    const requests: unknown[] = [];
    http.transport.mockImplementation(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ results: [{ url: "https://page.test/", text: "Page content" }] }),
        { headers: { "content-type": "application/json" } });
    });
    const instance = exaWebProvider.create({ baseUrl: "https://proxy.test", credential: "test-key" });
    const options = { signal: new AbortController().signal };
    await instance.fetch!({ url: "https://page.test/" }, options);
    await instance.fetch!({ url: "https://page.test/", query: "focus", maxCharacters: 300 }, options);
    const adjusted = await instance.fetch!({ url: "https://page.test/", maxCharacters: 2_000_000 }, options);
    expect(requests).toEqual([
      { urls: ["https://page.test/"], text: true, filterEmptyResults: false },
      { urls: ["https://page.test/"], text: { maxCharacters: 300 }, highlights: { query: "focus" }, filterEmptyResults: false },
      { urls: ["https://page.test/"], text: { maxCharacters: 1_000_000 }, filterEmptyResults: false },
    ]);
    expect(adjusted.hints).toMatchObject([{ code: "parameter_adjusted", parameter: "maxCharacters" }]);
  });
  // author:null on homepages and PDFs previously caused the entire response to fail; omit missing metadata fields while still delivering body text normally.
  it("null and absent metadata do not affect body normalization", () => {
    const result = exaResponse({ results: [
      { url: "https://page.test/", title: null, author: null, publishedDate: null, image: null, favicon: null, text: "Page content" },
      { url: "https://page.test/paper.pdf", text: "Paper content" },
    ] });
    expect(result.documents.map(({ details: _details, ...document }) => document)).toEqual([
      { url: "https://page.test/", content: [{ kind: "body", format: "text", text: "Page content" }] },
      { url: "https://page.test/paper.pdf", content: [{ kind: "body", format: "text", text: "Paper content" }] },
    ]);
  });
  // Exa text, highlights, and summary have different meanings; merging them into one content field would misrepresent a generated summary as original text.
  it("preserves body text, excerpts, summaries, and typed source data separately", () => {
    const result = exaResponse({ requestId: "request-1", results: [{ id: "source-1", url: "https://example.test/page", title: "Title",
      text: "Original body", highlights: ["Relevant passage"], summary: { finding: "Generated summary" }, author: "Author",
      publishedDate: "2026-01-01", score: 0.8, snapshotAt: "2026-01-02T00:00:00Z", entities: [{ type: "company", properties: { name: "Example" } }],
    }], costDollars: { total: 0.005, contents: { text: 0.001 } } });
    expect(result.documents[0]?.content).toEqual([
      { kind: "body", format: "text", text: "Original body" },
      { kind: "excerpt", format: "text", text: "Relevant passage" },
      { kind: "summary", format: "text", text: '{"finding":"Generated summary"}' },
    ]);
    expect(result.documents[0]).toMatchObject({ dates: [{ kind: "published", value: "2026-01-01" }], author: "Author", score: 0.8,
      details: [{ contract: { id: "asterism.builtin/web.exa.document" }, data: { id: "source-1", snapshotAt: "2026-01-02T00:00:00Z",
        entities: [{ type: "company", properties: { name: "Example" } }], summary: { finding: "Generated summary" } } }] });
    expect(result.usage).toEqual([{ name: "total", amount: 0.005, unit: "currency", currency: "USD" }]);
    expect(result.details?.[0]?.data).toMatchObject({ costDollars: { total: 0.005, contents: { text: 0.001 } } });
  });
  // Servers may relax a query or ignore fields; semantic differences must reach the model even when HTTP succeeds.
  it("merges locally unsupported conditions with server filtering explanations and preserves content-fetch failures", () => {
    const { options, hints } = exaSearchOptions({ query: "test", maxResults: 200, language: "zh", publishedAfter: "2026-01-01" });
    expect(options.numResults).toBe(100);
    expect(options.startPublishedDate).toBe("2026-01-01");
    const result = exaResponse({ results: [], notices: [{ code: "RESTRICTIONS_RELAXED", path: "/query", message: "The exact phrase restriction was relaxed." }],
      warnings: [{ code: "IGNORED_FIELD", path: "/startPublishedDate", message: "Date filtering was not applied." }],
      statuses: [{ id: "https://example.test/page", status: "error", error: { tag: "CRAWL_NOT_FOUND" } }],
    }, hints);
    expect(result.hints.map(hint => [hint.code, hint.parameter])).toEqual([
      ["unsupported_parameter", "language"], ["parameter_adjusted", "maxResults"],
      ["unsupported_parameter", "publishedAfter"], ["restrictions_relaxed", "query"], ["content_unavailable", undefined],
    ]);
    expect(result.hints.at(-1)?.message).toContain("CRAWL_NOT_FOUND");
    expect(result.details?.[0]?.data).toMatchObject({
      statuses: [{ id: "https://example.test/page", status: "error", error: { tag: "CRAWL_NOT_FOUND" } }],
    });
    expect(result.usage).toBeUndefined();
  });

  // Known upstream fields map to public parameters; private fields are not tool arguments.
  it("normalizes known diagnostics and preserves unrecognized upstream information", () => {
    const warnings = [
      { code: "IGNORED_FIELD", path: "/contents/text/maxCharacters", message: "contents.text.maxCharacters is ignored." },
      { code: "IGNORED_FIELD", path: "/highlights/query", message: "highlights.query is ignored." },
      { code: "IGNORED_FIELD", path: "/includeDomains", message: "Included domains ignored." },
      { code: "IGNORED_FIELD", path: "/type", message: "type is ignored.", detail: { value: "auto" } },
      { code: "NEW_WARNING", path: "/newOption", message: "Provider-specific warning.", detail: { reason: "new_reason" } },
    ];
    const notices = [{ code: "RESTRICTIONS_RELAXED", path: "/query", message: "The exact phrase restriction was relaxed.", details: { restriction: "exact_phrase" } }];
    const result = exaResponse({ results: [], warnings, notices });
    expect(result.hints).toEqual([
      { code: "unsupported_parameter", parameter: "maxCharacters", message: "Exa did not apply the requested maxCharacters parameter." },
      { code: "unsupported_parameter", parameter: "query", message: "Exa did not apply the requested query parameter." },
      { code: "unsupported_parameter", parameter: "includeDomains", message: "Exa did not apply the requested includeDomains parameter." },
      { code: "unsupported_parameter", message: "type is ignored." },
      { code: "NEW_WARNING", message: "Provider-specific warning." },
      { code: "restrictions_relaxed", parameter: "query", message: "The exact phrase restriction was relaxed." },
    ]);
    expect(result.details?.[0]?.data).toMatchObject({ warnings, notices });
  });

  // The real SDK decodes the error envelope; the adapter must retain its request identity.
  it("maps SDK request validation failures without losing the upstream envelope", async () => {
    http.transport.mockResolvedValue(new Response(JSON.stringify({
      requestId: "req-invalid", error: { type: "INVALID_REQUEST", code: "INVALID_ARGUMENT",
        message: "Invalid publication date.", detail: { field: "startPublishedDate" } },
    }), { status: 400, headers: { "content-type": "application/json" } }));
    const instance = exaWebProvider.create({ baseUrl: "https://proxy.test", credential: "test-key" });
    await expect(instance.search!({ query: "test", maxResults: 1 }, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: "invalid_request",
      message: 'Exa request failed (HTTP 400, INVALID_REQUEST, INVALID_ARGUMENT, requestId: req-invalid): Invalid publication date. Details: {"field":"startPublishedDate"}',
      cause: { statusCode: 400, requestId: "req-invalid", code: "INVALID_ARGUMENT", detail: { field: "startPublishedDate" } },
    });
  });

  // Rejected credentials are distinct from unavailable local credentials; timeouts are not cancellation.
  it("keeps authentication, rate-limit and timeout failures in the request-failure category", () => {
    for (const error of [new ExaError("Unauthorized.", 401), new ExaError("Rate limit exceeded.", 429), new ExaTimeoutError(1000)]) {
      expect(exaError(error)).toMatchObject({ code: "request_failed", message: expect.stringContaining(`HTTP ${error.statusCode}`), cause: error });
    }
  });

  // Message wording cannot establish a typed diagnostic, and cancellation must reach the owning scope.
  it("preserves cancellation and unknown exceptions without interpreting their messages", () => {
    const cancelled = new ExaAbortError(), unknown = new Error("INVALID_REQUEST: objective is missing.");
    expect(exaError(cancelled)).toBe(cancelled);
    expect(exaError(unknown)).toBe(unknown);
  });
});
