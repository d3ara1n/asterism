import { describe, expect, it } from "vitest";
import { deepseekFetchResponse, deepseekSearchOptions, deepseekSearchResponse } from "./deepseek.ts";

// Query operators carry filters; snippets, summaries, source authority and protocol errors retain their meanings.
describe("DeepSeek search and fetch contracts", () => {
  it("expresses DeepSeek filters as documented query operators and does not turn a country into an IP address", () => {
    const result = deepseekSearchOptions({ query: '"DeepSeek V4"', maxResults: 51,
      includeDomains: ["github.com", "huggingface.co"], excludeDomains: ["blocked.test"], language: "en",
      publishedAfter: "2026-01-02T01:00:00+08:00", publishedBefore: "2026-02-01", region: "CN" });
    expect(result.options).toEqual({ query: '"DeepSeek V4" site:github.com OR site:huggingface.co -site:blocked.test lang:en after:2026-01-01 before:2026-02-01', count: 50, need_content: false });
    expect(result.hints.map(hint => hint.parameter)).toEqual(["region", "publishedAfter", "maxResults"]);
  });

  it("distinguishes DeepSeek snippets, model-facing summaries and content, preserving score and authority", () => {
    const result = deepseekSearchResponse({ results: [{ url: "https://page.test/", title: "Page", snippet: "Snippet", summary: "Summary", content: "",
      date: "2026-06-01T00:00:00+00:00", rerank_score: 2.4, site_name: null, site_icon: "https://page.test/icon.ico", authority: 3 }] });
    expect(result.documents[0]).toMatchObject({ score: 2.4, favicon: "https://page.test/icon.ico", content: [
      { kind: "snippet", format: "text", text: "Snippet" }, { kind: "summary", format: "text", text: "Summary" },
    ], dates: [{ kind: "published", value: "2026-06-01T00:00:00+00:00" }] });
    expect(result.documents[0]?.details?.[0]?.data).toEqual({ site_name: null, authority: 3 });
    expect(result.usage).toBeUndefined();
    expect(() => deepseekFetchResponse({ title: "Page", content: " " }, "https://page.test/")).toThrow("no page body");
  });

  it("classifies valid JSON with an invalid upstream response shape as a protocol error", () => {
    expect(() => deepseekSearchResponse({ results: null })).toThrow(expect.objectContaining({
      code: "protocol", message: expect.stringContaining("DeepSeek returned an invalid response"), cause: expect.any(Error),
    }));
  });
});
