import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebResponse } from "@asterism-app/sdk/contracts";
import { WebError, type WebProviderDefinition } from "@asterism-app/sdk/runtime";
import { RunLifecycle } from "../plugins/lifecycle.ts";
import { limitWebBody, matchesWebUrl, matchWebProviders, resolveWebSettings, WebProviderRegistry } from "./web-providers.ts";

const types = [
  { id: "specific", fetch: true, urlPatterns: ["https://other.test/*", "https://docs.test/*", "https://docs.test/page"] },
  { id: "generic", fetch: true, urlPatterns: ["*"] },
  { id: "search", fetch: false, urlPatterns: ["*"] },
];
const state = (id: string, enabled = true) => ({ id, enabled, settings: {} });
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
  return { id, label: id, search: true, fetch: true, urlPatterns: ["*"], settings: [],
    create: () => ({ search: async () => empty, fetch: async () => empty }), ...overrides };
}
const apiKey = { kind: "secret" as const, key: "apiKey", label: "API key", required: true };
function registry(definitions: WebProviderDefinition[], states = definitions.map(item => state(item.id)),
  credential: (value: string) => Promise<string> = async value => value) {
  const life = new RunLifecycle(() => {});
  lifecycles.push(life);
  const web = new WebProviderRegistry({ list: () => states, credential });
  web.declare("test.web", definitions, life.group("call"));
  return web;
}

describe("Web provider settings resolution", () => {
  const type = { id: "service", settings: [
    { ...apiKey },
    { kind: "secret" as const, key: "token", label: "Token", required: false },
    { kind: "choice" as const, key: "mode", label: "Mode", default: "auto", options: [{ value: "auto", label: "Auto" }, { value: "deep", label: "Deep" }] },
  ] };
  const resolve = async (value: string) => value;
  // Unsaved choices must use the declared default; saved choices must survive; unset optional secrets stay absent rather than empty.
  it("applies choice defaults, keeps saved choices, and omits unset optional secrets", async () => {
    expect(await resolveWebSettings(type, { apiKey: "key" }, resolve)).toEqual({ apiKey: "key", mode: "auto" });
    expect(await resolveWebSettings(type, { apiKey: "key", token: "t", mode: "deep" }, resolve)).toEqual({ apiKey: "key", token: "t", mode: "deep" });
  });
  // A plugin update can remove an option or add a required secret; the provider must not run with a silently substituted value.
  it("rejects saved choices the declaration no longer offers and missing required secrets", async () => {
    await expect(resolveWebSettings(type, { apiKey: "key", mode: "removed" }, resolve))
      .rejects.toMatchObject({ code: "provider_unavailable", message: expect.stringContaining("'removed'") });
    await expect(resolveWebSettings(type, {}, resolve)).rejects.toMatchObject({ code: "credential_unavailable" });
  });
});

describe("Ordered web provider fallback", () => {
  it("advances past credential, request, and protocol failures and accepts an empty search", async () => {
    const calls: string[] = [];
    const definitions = [
      provider("key", { settings: [apiKey] }),
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
      { ...state("key"), settings: { apiKey: "!locked" } }, ...["request", "protocol", "success", "unused"].map(id => state(id))];
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

  it("stops after matching source failures despite different provider diagnostics", async () => {
    const next = vi.fn(async () => empty);
    const web = registry([
      provider("first", { create: () => ({ fetch: async () => { throw new WebError("request_failed", "Page not found.", 404); } }) }),
      provider("second", { create: () => ({ fetch: async () => { throw new WebError("request_failed", "Unable to extract: HTTP 404.", 404); } }) }),
      provider("unused", { create: () => ({ fetch: next }) }),
    ]);
    await expect(web.fetch({ url: "https://docs.test/missing" }, options())).rejects.toMatchObject({
      code: "request_failed", sourceStatus: 404,
      message: "Web provider fallback stopped after two consecutive identical failures. Web provider 'first' failed: Page not found. Web provider 'second' failed: Unable to extract: HTTP 404.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("stops search fallback on identical errors without a source status", async () => {
    const next = vi.fn(async () => empty);
    const web = registry([
      ...["first", "second"].map(id => provider(id, { create: () => ({
        search: async () => { throw new TypeError("fetch failed"); },
      }) })),
      provider("unused", { create: () => ({ search: next }) }),
    ]);
    await expect(web.search({ query: "query", maxResults: 5 }, options())).rejects.toThrow("two consecutive identical failures");
    expect(next).not.toHaveBeenCalled();
  });

  it("requires adjacent matches rather than accumulating earlier failures", async () => {
    const calls: string[] = [];
    const next = vi.fn(async () => empty);
    const web = registry([
      ...[404, 403, 404, 404].map((status, index) => provider(`attempt-${index}`, { create: () => ({
        fetch: async () => { calls.push(`attempt-${index}`); throw new WebError("request_failed", `Failure ${index}.`, status); },
      }) })),
      provider("unused", { create: () => ({ fetch: next }) }),
    ]);
    await expect(web.fetch({ url: "https://docs.test/page" }, options())).rejects.toMatchObject({ sourceStatus: 404 });
    expect(calls).toEqual(["attempt-0", "attempt-1", "attempt-2", "attempt-3"]);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    { reason: "different messages sharing a broad error code",
      first: new WebError("request_failed", "Quota exceeded."), second: new WebError("request_failed", "Service unavailable.") },
    { reason: "different error codes sharing a message",
      first: new WebError("protocol", "Failed."), second: new WebError("request_failed", "Failed.") },
    { reason: "different error names sharing a message",
      first: new TypeError("Failed."), second: new Error("Failed.") },
    { reason: "different source statuses sharing a message",
      first: new WebError("request_failed", "Page failed.", 403), second: new WebError("request_failed", "Page failed.", 404) },
    { reason: "a source status and an unclassified HTTP diagnostic",
      first: new WebError("request_failed", "HTTP 404", 404), second: new WebError("request_failed", "HTTP 404") },
  ])("continues past $reason", async ({ first, second }) => {
    const web = registry([
      provider("first", { create: () => ({ fetch: async () => { throw first; } }) }),
      provider("second", { create: () => ({ fetch: async () => { throw second; } }) }),
      provider("success"),
    ]);
    const result = await web.fetch({ url: "https://docs.test/page" }, options());
    expect(result.provider).toBe("success");
    expect(result.hints).toHaveLength(2);
  });

  it("a credential resolution failure interrupts matching source failures", async () => {
    const unavailable = () => ({ fetch: async () => { throw new WebError("request_failed", "Not found.", 404); } });
    const web = registry([
      provider("first", { create: unavailable }),
      provider("key", { settings: [apiKey] }),
      provider("third", { create: unavailable }),
      provider("success"),
    ]);
    const result = await web.fetch({ url: "https://docs.test/page" }, options());
    expect(result.provider).toBe("success");
    expect(result.hints).toHaveLength(3);
  });

  it("rejects invalid input and unmatched URLs before resolving providers", async () => {
    const create = vi.fn(() => ({ search: async () => empty, fetch: async () => empty }));
    const web = registry([provider("specific", { create, urlPatterns: ["https://docs.test/*"] })]);
    await expect(web.search({ query: " ", maxResults: 5 }, options())).rejects.toThrow();
    await expect(web.fetch({ url: "https://other.test/page" }, options())).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("retains captured priority, enablement, and credentials for later attempts", async () => {
    const states = [state("first"), { ...state("second"), settings: { apiKey: "!read-key" } }];
    let key = "original";
    const used: (string | null)[] = [];
    const web = registry([
      provider("first", { create: () => ({ search: async () => {
        states.reverse();
        states[0]!.enabled = false;
        key = "changed";
        throw new Error("Retry with the captured provider.");
      } }) }),
      provider("second", { settings: [apiKey], create: ({ settings }) => ({
        search: async () => { used.push(settings.apiKey ?? null); return empty; },
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
