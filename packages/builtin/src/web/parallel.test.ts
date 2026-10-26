import { afterEach, describe, expect, it, vi } from "vitest";
import { parallelResponse, parallelSearchOptions, parallelWebProvider } from "./parallel.ts";

const reply = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("Parallel search filters and response normalization", () => {
  // The API supports a date lower bound and at most 20 results; inclusion overrides exclusion.
  it("reports unsupported filters and converts timestamp bounds to UTC dates", () => {
    const { options, hints } = parallelSearchOptions({ query: "test", maxResults: 30, region: "GB", language: "en",
      includeDomains: ["example.com"], excludeDomains: ["blocked.example.com"],
      publishedAfter: "2026-01-02T01:00:00+08:00", publishedBefore: "2026-02-01" });
    expect(options.advanced_settings).toEqual({ max_results: 20, location: "gb",
      source_policy: { include_domains: ["example.com"], exclude_domains: undefined, after_date: "2026-01-01" } });
    expect(hints.map(hint => [hint.code, hint.parameter])).toEqual([
      ["unsupported_parameter", "language"], ["unsupported_parameter", "publishedBefore"],
      ["parameter_adjusted", "maxResults"], ["unsupported_parameter", "excludeDomains"], ["parameter_adjusted", "publishedAfter"],
    ]);
    const exclusions = parallelSearchOptions({ query: "test", maxResults: 2, includeDomains: [], excludeDomains: ["example.com"], publishedAfter: "2026-01-02" });
    expect(exclusions.options.advanced_settings?.source_policy).toMatchObject({ exclude_domains: ["example.com"], after_date: "2026-01-02" });
    expect(exclusions.hints).toEqual([]);
  });

  // Bodies and excerpts have separate semantics; SKU counts are not currency.
  it("preserves Markdown bodies, excerpts, source details and non-currency usage", () => {
    const result = parallelResponse({ extract_id: "extract-1", session_id: "session-1", errors: [],
      results: [{ url: "https://page.test/", title: null, publish_date: "2026-01-01", full_content: "# Body", excerpts: ["**Passage**"], source: "index" },
        { url: "https://page.test/other", publish_date: null, full_content: null, excerpts: [] }],
      usage: [{ name: "sku_extract", count: 2 }], warnings: null });
    expect(result.documents.map(({ details: _details, ...document }) => document)).toEqual([
      { url: "https://page.test/", content: [{ kind: "body", format: "markdown", text: "# Body" }, { kind: "excerpt", format: "markdown", text: "**Passage**" }], dates: [{ kind: "published", value: "2026-01-01" }] },
      { url: "https://page.test/other", content: [] },
    ]);
    expect(result.documents[0]?.details?.[0]?.data).toEqual({ source: "index" });
    expect(result.usage).toEqual([{ name: "sku_extract", amount: 2, unit: "count" }]);
    expect(result.requestId).toBe("extract-1");
    expect(result.details?.[0]?.data).toMatchObject({ session_id: "session-1", usage: [{ name: "sku_extract", count: 2 }] });
  });

  // Successful HTTP responses may contain extraction failures and query adjustments.
  it("merges warnings and extraction errors while accepting empty search results", () => {
    const result = parallelResponse({ search_id: "search-1", results: [],
      warnings: [{ type: "input_validation_warning", message: "Query adjusted.", detail: { field: "query" } }],
      errors: [{ url: "https://page.test/", error_type: "fetch_failed", http_status_code: 403, content: "Forbidden" }],
    }, [{ code: "unsupported_parameter", parameter: "language", message: "Language filter unavailable." }]);
    expect(result.hints).toEqual([
      { code: "unsupported_parameter", parameter: "language", message: "Language filter unavailable." },
      { code: "input_validation_warning", message: "Query adjusted." },
      { code: "content_unavailable", message: "Content retrieval for https://page.test/ reported fetch_failed (HTTP 403)." },
    ]);
    expect(result.details?.[0]?.data).toMatchObject({ warnings: [{ detail: { field: "query" } }], errors: [{ content: "Forbidden" }] });
    expect(result.documents).toEqual([]);
    expect(result.usage).toBeUndefined();
  });
});

describe("Parallel official SDK boundary", () => {
  // The real SDK uses a local transport to verify versioned paths and full-content requests.
  it("preserves endpoint prefixes and requests bodies with optional focused excerpts", async () => {
    const requests: { path: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      requests.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
      return reply(url.pathname.endsWith("search") ? { search_id: "search-1", results: [] }
        : { extract_id: "extract-1", results: [{ url: "https://page.test/", full_content: "Body", excerpts: [] }], errors: [] });
    }));
    const provider = parallelWebProvider.create({ baseUrl: "https://proxy.test/parallel", credential: "test-key" });
    const options = { signal: new AbortController().signal };
    await provider.search!({ query: "test", maxResults: 3 }, options);
    await provider.fetch!({ url: "https://page.test/" }, options);
    const bounded = await provider.fetch!({ url: "https://page.test/", query: "focus", maxCharacters: 4 }, options);
    expect(requests).toEqual([
      { path: "/parallel/v1/search", body: { search_queries: ["test"], advanced_settings: { max_results: 3, source_policy: {} } } },
      { path: "/parallel/v1/extract", body: { urls: ["https://page.test/"], advanced_settings: { full_content: true } } },
      { path: "/parallel/v1/extract", body: { urls: ["https://page.test/"], objective: "focus", advanced_settings: { full_content: { max_chars_per_result: 4 } } } },
    ]);
    // Reaching the requested limit does not establish that truncation occurred.
    expect(bounded.documents[0]?.content[0]).toEqual({ kind: "body", format: "markdown", text: "Body" });
  });

  // Extract may return excerpts alone; those do not satisfy a request for a page body.
  it("rejects empty and excerpt-only fetch results", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ extract_id: "extract-1", results: [], errors: [{ url: "https://page.test/", error_type: "fetch_failed", http_status_code: 403 }] }))
      .mockResolvedValueOnce(reply({ extract_id: "extract-2", results: [{ url: "https://page.test/", full_content: null, excerpts: ["Passage"] }], errors: [] })));
    const provider = parallelWebProvider.create({ baseUrl: "https://proxy.test", credential: "test-key" });
    const options = { signal: new AbortController().signal };
    await expect(provider.fetch!({ url: "https://page.test/" }, options)).rejects.toMatchObject({ code: "request_failed", message: expect.stringContaining("fetch_failed (HTTP 403)") });
    await expect(provider.fetch!({ url: "https://page.test/" }, options)).rejects.toMatchObject({ code: "request_failed", message: "Parallel returned no page body for this URL." });
  });

  // The SDK creates a transport signal; caller cancellation must reach it.
  it("propagates caller cancellation to the SDK HTTP request", async () => {
    const controller = new AbortController();
    let transportAborted = false;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => {
      controller.abort();
      transportAborted = init?.signal?.aborted === true;
      init?.signal?.throwIfAborted();
      throw new Error("Expected transport cancellation.");
    }));
    const provider = parallelWebProvider.create({ baseUrl: "https://proxy.test", credential: "test-key" });
    await expect(provider.search!({ query: "test", maxResults: 1 }, { signal: controller.signal })).rejects.toMatchObject({ name: "Error", message: "Request was aborted." });
    expect(transportAborted).toBe(true);
  });
});
