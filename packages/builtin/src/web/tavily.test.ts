import { afterEach, describe, expect, it, vi } from "vitest";
import { tavilyResponse, tavilySearchOptions, tavilyWebProvider } from "./tavily.ts";

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

// Focused extraction returns chunks instead of a full body; separate requests preserve both content and reported usage.
describe("Tavily search and extraction contracts", () => {
  it("maps Tavily country names and exposes estimated publication-or-update filtering", () => {
    const result = tavilySearchOptions({ query: "test", maxResults: 30, region: "CZ", language: "zh-cn",
      publishedAfter: "2026-01-02T01:00:00+08:00", includeDomains: ["allowed.test"], excludeDomains: ["blocked.test"] }, "advanced");
    expect(result.options).toMatchObject({ country: "czech republic", language: "zh-cn", search_depth: "advanced", max_results: 20,
      start_date: "2026-01-01", filter_by_published_date: true, include_domains: ["allowed.test"], exclude_domains: ["blocked.test"] });
    expect(result.hints.some(hint => hint.message.includes("update date"))).toBe(true);
    const unsupported = tavilySearchOptions({ query: "test", maxResults: 2, region: "HK" });
    expect(unsupported.options.country).toBeUndefined();
    expect(unsupported.hints).toMatchObject([{ parameter: "region", code: "unsupported_parameter" }]);
  });

  it("preserves Tavily excerpts, uncertain date kind, zero credits and per-URL failures", () => {
    const result = tavilyResponse({ request_id: "search-1", usage: { credits: 0 }, results: [
      { url: "https://page.test/", title: "Page", content: "Source excerpt", published_date: "2026-01-01", score: 0.7, favicon: "invalid icon", id: "source-1" },
    ], failed_results: [{ url: "https://blocked.test/", error: "Blocked" }] }, "search");
    expect(result.documents[0]).toMatchObject({ content: [{ kind: "excerpt", format: "text", text: "Source excerpt" }],
      dates: [{ kind: "unknown", value: "2026-01-01" }], score: 0.7 });
    expect(result.documents[0]?.favicon).toBeUndefined();
    expect(result.documents[0]?.details?.[0]?.data).toMatchObject({ favicon: "invalid icon", id: "source-1" });
    expect(result.usage).toEqual([{ name: "search", amount: 0, unit: "credits" }]);
    expect(result.hints).toEqual([{ code: "content_unavailable", message: "Content retrieval for https://blocked.test/ failed: Blocked" }]);
  });

  it("retrieves the body separately and preserves both requests' content and usage", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)); requests.push(body);
      return reply(body.query ? { request_id: "excerpts-1", usage: { credits: 1 }, results: [{ url: "https://page.test/", raw_content: "Focused chunk", source: "ranked" }] }
        : { request_id: "body-1", usage: { credits: 1 }, results: [{ url: "https://page.test/", raw_content: "# Full body" }] });
    }));
    const provider = tavilyWebProvider.create({ settings: { apiKey: "test", searchDepth: "basic", extractDepth: "advanced" } });
    const result = await provider.fetch!({ url: "https://page.test/", query: "focus", maxCharacters: 4 }, { signal: new AbortController().signal });
    expect(requests).toEqual([
      { urls: ["https://page.test/"], format: "markdown", extract_depth: "advanced", include_usage: true },
      { urls: ["https://page.test/"], format: "markdown", extract_depth: "advanced", include_usage: true, query: "focus" },
    ]);
    expect(result.documents[0]?.content).toEqual([
      { kind: "body", format: "markdown", text: "# Full body" }, { kind: "excerpt", format: "markdown", text: "Focused chunk" },
    ]);
    expect(result.usage).toEqual([{ name: "extract", amount: 1, unit: "credits" }, { name: "excerpts", amount: 1, unit: "credits" }]);
    expect(result.details?.map(detail => detail.data)).toMatchObject([{ request_id: "body-1" }, { request_id: "excerpts-1" }]);
    expect(result.documents[0]?.details?.[1]?.data).toEqual({ source: "ranked" });
  });

  it("rejects failed extraction instead of satisfying fetch with an empty result", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => reply({ results: [], failed_results: [{ url: "https://page.test/", error: "Blocked" }] })));
    const provider = tavilyWebProvider.create({ settings: { apiKey: "test", extractDepth: "basic" } });
    await expect(provider.fetch!({ url: "https://page.test/", query: "focus" }, { signal: new AbortController().signal })).rejects.toThrow("Blocked");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
