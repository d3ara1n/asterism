import { describe, expect, it } from "vitest";
import { firecrawlFetchResponse, firecrawlSearchOptions, firecrawlSearchResponse } from "./firecrawl.ts";

// Time-range filters and page failures have provider-specific semantics independent of HTTP success.
describe("Firecrawl search and scrape contracts", () => {
  it("uses Firecrawl time-range syntax and reports unsupported or mutually exclusive filters", () => {
    const result = firecrawlSearchOptions({ query: "test", maxResults: 101, language: "en", region: "GB",
      includeDomains: ["allowed.test"], excludeDomains: ["blocked.test"], publishedAfter: "2026-01-01", publishedBefore: "2026-02-01" });
    expect(result.options).toMatchObject({ limit: 100, country: "GB", includeDomains: ["allowed.test"],
      tbs: "cdr:1,cd_min:01/01/2026,cd_max:02/01/2026" });
    expect(result.options.excludeDomains).toBeUndefined();
    expect(result.hints.map(hint => hint.parameter)).toEqual(["excludeDomains", "language", "publishedAfter", "maxResults"]);
  });

  it("preserves Firecrawl warnings and credits and rejects unsuccessful responses or scraped error pages", () => {
    const result = firecrawlSearchResponse({ success: true, id: "search-1", creditsUsed: 2, warning: "Partial results", data: {
      web: [{ url: "https://page.test/", title: "Page", description: "Snippet", position: 1 }],
    } });
    expect(result.documents[0]).toMatchObject({ content: [{ kind: "snippet", format: "text", text: "Snippet" }] });
    expect(result.documents[0]?.details?.[0]?.data).toEqual({ position: 1 });
    expect(result.usage).toEqual([{ name: "credits", amount: 2, unit: "credits" }]);
    expect(result.hints).toEqual([{ code: "provider_warning", message: "Partial results" }]);
    expect(() => firecrawlSearchResponse({ success: false, error: "Request rejected", code: "REJECTED" })).toThrow("REJECTED");
    expect(() => firecrawlFetchResponse({ success: true, data: { markdown: "# Not found", metadata: { statusCode: 404 } } }, "https://page.test/"))
      .toThrow(expect.objectContaining({ code: "request_failed", sourceStatus: 404, message: expect.stringContaining("HTTP 404") }));
    expect(() => firecrawlFetchResponse({ success: true, data: { metadata: { statusCode: 200, error: "Extraction failed." } } }, "https://page.test/"))
      .toThrow(expect.objectContaining({ sourceStatus: undefined, message: expect.stringContaining("Extraction failed.") }));
    expect(() => firecrawlFetchResponse({ success: true, data: {} }, "https://page.test/")).toThrow("no page body");
  });

  it("keeps Firecrawl final URL and full Markdown while reporting unsupported focused excerpts", () => {
    const result = firecrawlFetchResponse({ success: true, data: { markdown: "# Body", metadata: {
      title: "Page", url: "https://page.test/final", sourceURL: "https://page.test/", statusCode: 200,
    } } }, "https://page.test/", "focus");
    expect(result.documents[0]).toMatchObject({ url: "https://page.test/final", content: [{ kind: "body", format: "markdown", text: "# Body" }] });
    expect(result.hints).toMatchObject([{ parameter: "query", code: "unsupported_parameter" }]);
    expect(result.usage).toBeUndefined();
  });
});
