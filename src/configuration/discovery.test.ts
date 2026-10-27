import { describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "../shared/configuration.ts";
import { discoverModels } from "./discovery.ts";

const provider: ModelProvider = {
  id: "relay", name: "Relay", baseUrl: "https://example.test/proxy/v1/", protocol: "openai-responses",
  enabled: true, auth: "api_key", credentialState: "available", compatibility: [],
};

describe("Model discovery protocols and transport boundaries", () => {
  // Catalog format is independent of message protocol; standard data/id catalogs work with all three connections.
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s preserves paths, sends explicit credentials, and deduplicates without guessing capabilities from names", async protocol => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({
      data: [{ id: "vendor/reasoner" }, { id: "vendor/reasoner" }, { id: "other", capabilities: "nonstandard" }],
    }));
    const result = await discoverModels({ provider: { ...provider, protocol }, apiKey: "test-only", signal: new AbortController().signal }, transport);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/proxy/v1/models");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(protocol === "anthropic" ? null : "Bearer test-only");
    expect(headers.get("x-api-key")).toBe(protocol === "anthropic" ? "test-only" : null);
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    expect(result).toEqual([{ modelId: "vendor/reasoner", name: "vendor/reasoner" }, { modelId: "other", name: "other" }]);
  });

  // Anthropic catalog metadata and pagination are independent of inference protocol; unauthenticated connections send no credentials.
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s recognizes Anthropic metadata and paginates by cursor", async protocol => {
    const calls: string[] = [];
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(String(url));
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBeNull();
      expect(headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
      return Response.json(calls.length === 1 ? {
        data: [{ id: "first", display_name: "First", max_input_tokens: 200000,
          capabilities: { thinking: { supported: true, types: { disabled: { supported: true } } },
            effort: { low: { supported: true }, high: { supported: true }, max: { supported: false } } } }],
        has_more: true, last_id: "first",
      } : { data: [{ id: "second" }], has_more: false });
    });
    const result = await discoverModels({ provider: { ...provider, protocol, auth: "none" }, apiKey: "must-not-send", signal: new AbortController().signal }, transport);
    expect(calls).toEqual(["https://example.test/proxy/v1/models", "https://example.test/proxy/v1/models?after_id=first"]);
    expect(result).toEqual([
      { modelId: "first", name: "First", contextWindow: 200000, reasoning: true, thinkingLevels: ["off", "low", "high"] },
      { modelId: "second", name: "second" },
    ]);
  });

  // Zhipu /api/v1/models uses models/slug in observed responses; the same catalog is accepted regardless of inference protocol or domain.
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s recognizes Codex-style catalogs and imports only supported metadata", async protocol => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ models: [
      { slug: "glm-5.3", display_name: "GLM 5.3", context_window: 1048576,
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "max" }],
        base_instructions: "Client instructions", experimental_supported_tools: ["shell"] },
      { slug: "glm-5-turbo", supported_reasoning_levels: [] },
      { slug: "glm-5.3" },
    ] }));
    expect(await discoverModels({ provider: { ...provider, protocol }, apiKey: "test", signal: new AbortController().signal }, transport)).toEqual([
      { modelId: "glm-5.3", name: "GLM 5.3" },
      { modelId: "glm-5-turbo", name: "glm-5-turbo" },
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // Anthropic authentication is not Bearer; server error bodies may contain credentials and must not reach the UI.
  it("Anthropic uses x-api-key and returns only fixed error categories", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("private-test-key");
      expect(headers.get("authorization")).toBeNull();
      return new Response("private-test-key", { status: 401 });
    });
    await expect(discoverModels({ provider: { ...provider, protocol: "anthropic" }, apiKey: "private-test-key", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "authentication", message: "Model discovery failed: authentication." });
  });

  // A missing endpoint differs from a valid empty list; bad responses and repeated cursors cannot appear as successful partial catalogs.
  it("distinguishes empty lists, missing endpoints, and invalid pagination", async () => {
    const input = { provider, apiKey: "test", signal: new AbortController().signal };
    expect(await discoverModels(input, async () => Response.json({ data: [] }))).toEqual([]);
    await expect(discoverModels(input, async () => new Response("", { status: 404 }))).rejects.toMatchObject({ code: "unsupported" });
    expect(await discoverModels(input, async () => Response.json({ models: [] }))).toEqual([]);
    const repeated = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: "same" }], has_more: true, last_id: "same" }));
    await expect(discoverModels(input, repeated)).rejects.toMatchObject({ code: "protocol" });
    expect(repeated).toHaveBeenCalledTimes(2);
  });

  // Guess only known structures: unknown, ambiguous, or corrupt responses cannot degrade to successful empty lists or partial catalogs.
  it.each([
    { label: "unknown structure", body: { items: [] } },
    { label: "ambiguous catalog", body: { data: [], models: [{ slug: "other" }] } },
    { label: "Codex entry missing slug", body: { models: [{ slug: "valid" }, { id: "wrong-field" }] } },
    { label: "corrupt recognized Anthropic metadata", body: { data: [{ id: "model", capabilities: { thinking: { supported: "yes" } } }] } },
  ])("rejects $label", async ({ body }) => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(discoverModels({ provider, apiKey: "test", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "protocol", message: "Model discovery failed: protocol." });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // Discovery and execution follow the same HTTPS rules; misconfiguration cannot send keys over remote plaintext connections.
  it("rejects credentialed remote HTTP before sending a request", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(discoverModels({ provider: { ...provider, baseUrl: "http://example.test/v1" }, apiKey: "test", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "configuration" });
    expect(transport).not.toHaveBeenCalled();
  });
});
