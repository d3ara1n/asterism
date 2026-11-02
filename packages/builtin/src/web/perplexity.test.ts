import { afterEach, describe, expect, it, vi } from "vitest";
import { APIUserAbortError } from "@perplexity-ai/perplexity_ai";
import { perplexityResponse, perplexitySearchOptions, perplexityWebProvider } from "./perplexity.ts";

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

// Domain filters and calendar dates follow the search API; SDK errors and cancellation retain their shared meanings.
describe("Perplexity search contract", () => {
  it("uses Perplexity exclusion syntax, calendar dates and inclusion precedence", () => {
    const excluded = perplexitySearchOptions({ query: "test", maxResults: 30, excludeDomains: ["blocked.test"],
      publishedAfter: "2026-01-02T01:00:00+08:00", publishedBefore: "2026-02-01", language: "en", region: "GB" });
    expect(excluded.options).toMatchObject({ search_domain_filter: ["-blocked.test"], max_results: 20,
      search_after_date_filter: "01/01/2026", search_before_date_filter: "02/01/2026", search_language_filter: ["en"], country: "GB" });
    expect(excluded.hints.map(hint => hint.parameter)).toEqual(["maxResults", "publishedAfter"]);
    const included = perplexitySearchOptions({ query: "test", maxResults: 2, includeDomains: ["allowed.test"], excludeDomains: ["blocked.test"] });
    expect(included.options.search_domain_filter).toEqual(["allowed.test"]);
    expect(included.hints).toMatchObject([{ code: "unsupported_parameter", parameter: "excludeDomains" }]);
  });

  it("keeps Perplexity publication and modification dates separate without inventing usage", () => {
    const result = perplexityResponse({ id: "search-1", server_time: "2026-11-02", results: [
      { url: "https://page.test/", title: "Page", snippet: "Passage", date: "2026-01-01", last_updated: "2026-02-01", rank: 1 },
      { url: "https://page.test/empty", title: "Empty", snippet: "", date: null, last_updated: null },
    ] });
    expect(result.documents[0]).toMatchObject({ content: [{ kind: "snippet", format: "text", text: "Passage" }],
      dates: [{ kind: "published", value: "2026-01-01" }, { kind: "modified", value: "2026-02-01" }] });
    expect(result.documents[0]?.details?.[0]?.data).toEqual({ rank: 1 });
    expect(result.documents[1]?.dates).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it("normalizes Perplexity HTTP parameter failures without discarding upstream details", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => reply({ error: { message: "Too many domains", code: "invalid_domains" } }, 400)));
    const provider = perplexityWebProvider.create({ settings: { apiKey: "test" } });
    await expect(provider.search!({ query: "test", maxResults: 1 }, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: "invalid_request", message: expect.stringContaining("invalid_domains"), cause: expect.objectContaining({ status: 400 }),
    });
  });

  it("propagates cancellation through the Perplexity SDK", async () => {
    const controller = new AbortController();
    let transportAborted = false;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => {
      controller.abort();
      transportAborted = init?.signal?.aborted === true;
      init?.signal?.throwIfAborted();
      throw new Error("Expected transport cancellation.");
    }));
    const provider = perplexityWebProvider.create({ settings: { apiKey: "test" } });
    await expect(provider.search!({ query: "test", maxResults: 1 }, { signal: controller.signal })).rejects.toBeInstanceOf(APIUserAbortError);
    expect(transportAborted).toBe(true);
  });
});
