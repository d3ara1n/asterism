import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebResponse } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { RunLifecycle } from "../plugins/lifecycle.ts";
import { limitWebBody, matchesWebUrl, matchWebProviders, WebProviderRegistry } from "./web-providers.ts";

const types = [
  { id: "specific", fetch: true, urlPatterns: ["https://other.test/*", "https://docs.test/*", "https://docs.test/page"] },
  { id: "generic", fetch: true, urlPatterns: ["*"] },
  { id: "search", fetch: false, urlPatterns: ["*"] },
];
const state = (id: string, enabled = true) => ({ id, enabled });
describe("Web URL routing", () => {
  it("treats only asterisks as wildcards and matches other URL characters literally", () => {
    expect(matchesWebUrl("https://docs.test/page?v=a+b", "https://docs.test/page?v=a+b")).toBe(true);
    expect(matchesWebUrl("https://docs.test/*", "https://docsXtest/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test.evil/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test/a?x=1")).toBe(true);
  });
  it("returns every matching provider once in saved order", () => {
    const ordered = [state("specific"), state("generic")];
    expect(matchWebProviders(ordered, types, "https://docs.test/page")).toEqual(["specific", "generic"]);
    expect(matchWebProviders([...ordered].reverse(), types, "https://docs.test/page")).toEqual(["generic", "specific"]);
    expect(matchWebProviders(ordered, types, "https://news.test/page")).toEqual(["generic"]);
  });
  it("excludes disabled and search-only providers and returns no candidates for unmatched URLs", () => {
    const states = [state("generic", false), state("search"), state("specific")];
    expect(matchWebProviders(states, types, "https://docs.test/page")).toEqual(["specific"]);
    expect(matchWebProviders(states, types, "https://news.test/page")).toEqual([]);
  });
});

const lifecycles: RunLifecycle[] = [];
afterEach(async () => { await Promise.all(lifecycles.splice(0).map(life => life.close())); });
const empty: WebResponse = { documents: [], hints: [] };
const options = () => ({ signal: new AbortController().signal });
function provider(id: string, overrides: Partial<WebProviderDefinition> = {}): WebProviderDefinition {
  return { id, label: id, search: true, fetch: true, urlPatterns: ["*"], credential: null,
    defaultBaseUrl: "https://provider.test", create: () => ({ search: async () => empty, fetch: async () => empty }), ...overrides };
}
function registry(definitions: WebProviderDefinition[], states = definitions.map(item => state(item.id)),
  credential: (id: string) => Promise<string | null> = async () => null) {
  const life = new RunLifecycle(() => {});
  lifecycles.push(life);
  const web = new WebProviderRegistry({ list: () => states, credential });
  web.declare("test.web", definitions, life.group("call"));
  return web;
}

describe("Ordered web provider fallback", () => {
  it("advances past credential, request, and protocol failures and accepts an empty search", async () => {
    const calls: string[] = [];
    const definitions = [
      provider("key", { credential: { kind: "api_key" } }),
      provider("request", { create: () => ({ search: async () => {
        calls.push("request"); throw new WebError("request_failed", "Service unavailable.");
      } }) }),
      provider("protocol", { create: () => ({ search: async () => {
        calls.push("protocol"); return { documents: "invalid" } as unknown as WebResponse;
      } }) }),
      provider("success", { create: () => ({ search: async () => { calls.push("success"); return empty; } }) }),
      provider("unused", { create: () => ({ search: async () => { calls.push("unused"); return empty; } }) }),
      provider("disabled"), provider("fetch-only", { search: false }),
    ];
    const states = [state("missing"), state("disabled", false), state("fetch-only"),
      ...["key", "request", "protocol", "success", "unused"].map(id => state(id))];
    const web = registry(definitions.reverse(), states, async () => { throw new WebError("credential_unavailable", "Key unreadable."); });
    const result = await web.search({ query: "query", maxResults: 5 }, options());
    expect(calls).toEqual(["request", "protocol", "success"]);
    expect(result).toMatchObject({ provider: "success", query: "query", documents: [] });
    expect(result.hints.map(hint => hint.code)).toEqual(["provider_failed", "provider_failed", "provider_failed"]);
    expect(result.hints[0]?.message).toContain("Key unreadable.");
    expect(result.hints[1]?.message).toContain("Service unavailable.");
    expect(result.hints[2]?.message).toContain("Invalid web provider result");
  });

  it("tries only matching fetch providers in saved order and applies the body budget", async () => {
    const calls: string[] = [];
    const fetcher = (id: string, fail: boolean) => provider(id, { create: () => ({ fetch: async () => {
      calls.push(id);
      if (fail) throw new Error("Fetch failed.");
      return { documents: [{ url: "https://docs.test/page", content: [{ kind: "body" as const, format: "text" as const, text: "a😀bc" }] }],
        hints: [{ code: "notice", message: "Upstream notice." }] };
    } }) });
    const web = registry([
      { ...fetcher("unmatched", false), urlPatterns: ["https://elsewhere.test/*"] },
      { ...fetcher("specific", true), urlPatterns: ["https://docs.test/*", "*"] },
      fetcher("generic", false), fetcher("unused", false),
    ]);
    const result = await web.fetch({ url: "https://docs.test/page", maxCharacters: 2 }, options());
    expect(calls).toEqual(["specific", "generic"]);
    expect(result).toMatchObject({ provider: "generic", requestedUrl: "https://docs.test/page",
      documents: [{ content: [{ text: "a😀", truncated: true }] }] });
    expect(result.hints.map(hint => hint.code)).toEqual(["provider_failed", "notice"]);
  });

  it.each(["reject", "resolve"] as const)("stops on caller cancellation even when the provider later %ss", async outcome => {
    const controller = new AbortController();
    const reason = new Error("Caller cancelled.");
    const next = vi.fn(async () => empty);
    const web = registry([
      provider("first", { create: () => ({ search: async () => {
        controller.abort(reason);
        if (outcome === "reject") throw new Error("Request interrupted.");
        return empty;
      } }) }),
      provider("next", { create: () => ({ search: next }) }),
    ]);
    await expect(web.search({ query: "query", maxResults: 5 }, { signal: controller.signal }))
      .rejects.toBe(reason);
    expect(next).not.toHaveBeenCalled();
  });

  it("reports every failure in order with the final error code when all candidates fail", async () => {
    const web = registry([
      provider("first", { create: () => ({ search: async () => { throw new Error("Offline."); } }) }),
      provider("second", { create: () => ({ search: async () => { throw new WebError("unsupported", "Unsupported filter."); } }) }),
    ]);
    await expect(web.search({ query: "query", maxResults: 5 }, options())).rejects.toMatchObject({
      code: "unsupported",
      message: "All eligible web providers failed. Web provider 'first' failed: Offline. Web provider 'second' failed: Unsupported filter.",
    });
  });

  it("rejects invalid input and unmatched URLs before resolving providers", async () => {
    const create = vi.fn(() => ({ search: async () => empty, fetch: async () => empty }));
    const web = registry([provider("specific", { create, urlPatterns: ["https://docs.test/*"] })]);
    await expect(web.search({ query: " ", maxResults: 5 }, options())).rejects.toThrow();
    await expect(web.fetch({ url: "https://other.test/page" }, options())).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("retains captured priority, enablement, and credentials for later attempts", async () => {
    const states = [state("first"), state("second")];
    let key = "original";
    const used: (string | null)[] = [];
    const web = registry([
      provider("first", { create: () => ({ search: async () => {
        states.reverse();
        states[0]!.enabled = false;
        key = "changed";
        throw new Error("Retry with the captured provider.");
      } }) }),
      provider("second", { credential: { kind: "api_key" }, create: ({ credential }) => ({
        search: async () => { used.push(credential); return empty; },
      }) }),
    ], states, async () => key);
    expect((await web.search({ query: "query", maxResults: 5 }, options())).provider).toBe("second");
    expect(used).toEqual(["original"]);
  });
});

describe("Web fetch body budgets", () => {
  // Resetting the budget for each part would exceed the limit; UTF-16 slicing would split emoji.
  it("shares each document's budget across body parts and preserves excerpts and metadata", () => {
    const response: WebResponse = {
      documents: [
        { url: "https://docs.test/a", content: [
          { kind: "body", format: "text", text: "甲😀" },
          { kind: "excerpt", format: "text", text: "额外摘录" },
          { kind: "body", format: "markdown", text: "乙丙丁" },
          { kind: "body", format: "text", text: "剩余正文" },
        ] },
        { url: "https://docs.test/b", content: [{ kind: "body", format: "text", text: "ab😀d" }] },
      ],
      hints: [{ code: "notice", message: "Provider notice." }],
      usage: [{ name: "total", amount: 0.001, unit: "currency", currency: "USD" }],
    };
    const result = limitWebBody(response, 3);
    expect(result.documents.map(document => document.content)).toEqual([
      [
        { kind: "body", format: "text", text: "甲😀" },
        { kind: "excerpt", format: "text", text: "额外摘录" },
        { kind: "body", format: "markdown", text: "乙", truncated: true },
        { kind: "body", format: "text", text: "", truncated: true },
      ],
      [{ kind: "body", format: "text", text: "ab😀", truncated: true }],
    ]);
    expect(result.hints).toEqual(response.hints);
    expect(result.usage).toEqual(response.usage);
    expect(response.documents[0]?.content[2]?.text).toBe("乙丙丁");
  });

  it("preserves truncation markers when the budget is omitted or no content is clipped", () => {
    const response: WebResponse = { hints: [], documents: [{ url: "https://docs.test/a", content: [
      { kind: "body", format: "text", text: "abc" },
      { kind: "summary", format: "text", text: "Generated summary" },
    ] }, { url: "https://docs.test/b", content: [
      { kind: "body", format: "text", text: "ab", truncated: true },
    ] }] };
    expect(limitWebBody(response)).toEqual(response);
    expect(limitWebBody(response, 3)).toEqual(response);
  });
});
