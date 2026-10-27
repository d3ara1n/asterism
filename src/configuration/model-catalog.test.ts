import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, Model } from "@opencode-ai/models";
import { createModelInput, modelReference, type ProviderModel } from "../shared/configuration.ts";
import { loadModelCatalog, modelParameters } from "./model-catalog.ts";
import { emptyModelRates, emptyModalityRates, type ModelCost } from "@asterism-app/sdk/contracts";

const current: ProviderModel = {
  ...createModelInput("my-connection", { modelId: "test-model", name: "My model" }),
  contextWindow: 1000,
  generation: { maxOutputTokens: 100, temperature: 0.5, topP: 0.9 },
  compatibility: [{ id: "systemMessageInMessages" }],
};
const entry: Model = {
  id: "test-model", name: "Upstream name", description: "", reasoning: true, tool_call: true,
  attachment: false, modalities: { input: ["text"], output: ["text"] }, open_weights: false,
  release_date: "2026-01-01", last_updated: "2026-01-01",
  limit: { context: 200000, output: 32000 },
  cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }],
};
function catalog(model: Model = entry): Catalog {
  return {
    providers: { lab: { id: "lab", name: "Lab", env: ["KEY"], npm: "@ai-sdk/openai",
      doc: "https://lab.test/docs", models: { "test-model": model } } },
    models: { "lab/test-model": { id: "lab/test-model", name: "Model", description: "" } },
  };
}
afterEach(() => { vi.unstubAllGlobals(); });
const perMillion = { unit: "token", per: 1_000_000 } as const;

describe("models.dev parameter overrides", () => {
  // New models enable reasoning by default, while an endpoint's explicit false remains valid configuration.
  it("new models enable reasoning by default and preserve an endpoint's explicit disablement", () => {
    expect(createModelInput("local", { modelId: "new", name: "New" }).capabilities.reasoning).toBe(true);
    expect(createModelInput("local", { modelId: "new", name: "New", reasoning: false }).capabilities.reasoning).toBe(false);
  });
  // Explicit retrieval replaces valid old values; display identity, compatibility settings, and omitted generation parameters are not catalog parameters.
  it("overwrites all mappable fields by model ID and preserves non-catalog configuration", () => {
    const result = modelParameters(catalog(), current);
    expect(result.value).toMatchObject({
      name: "My model", modelId: "test-model", providerId: "my-connection", enabled: true,
      contextWindow: 200000, capabilities: { reasoning: true, tools: true, thinkingLevels: ["off", "low", "high"] },
      generation: { maxOutputTokens: 32000, temperature: 0.5, topP: 0.9 }, compatibility: current.compatibility,
    });
    expect(result.report).toEqual({ source: "lab/test-model", unfilled: [] });
    const disabled = modelParameters(catalog({ ...entry, reasoning: false, tool_call: false, reasoning_options: undefined }), current);
    expect(disabled.value.capabilities).toEqual({ reasoning: false, tools: false, thinkingLevels: [] });
  });

  // Reference parameters for a model ID do not vary by connection; relay records are excluded and ambiguous IDs do not arbitrarily select the first match.
  it("matches original models solely by model ID, ignores connection and relay overrides, and rejects ambiguous IDs and tricky aliases", () => {
    const data = catalog();
    data.providers.relay = { ...data.providers.lab!, id: "relay", api: "https://relay.test/v1",
      models: { "test-model": { ...entry, limit: { context: 100, output: 10 }, reasoning_options: [{ type: "effort", values: ["high"] }] } } };
    for (const providerId of ["lab", "relay", "my-connection"]) {
      const result = modelParameters(data, { ...current, providerId });
      expect(result.report).toEqual({ source: "lab/test-model", unfilled: [] });
      expect(result.value.contextWindow).toBe(200000);
      expect(result.value.capabilities.thinkingLevels).toEqual(["off", "low", "high"]);
    }
    expect(modelParameters(data, { ...current, modelId: "lab/test-model" }).report.source).toBe("lab/test-model");
    expect(() => modelParameters(data, { ...current, modelId: "test-model-thinking-latest" })).toThrow(expect.objectContaining({ code: "not_found" }));
    data.models["other/test-model"] = { ...data.models["lab/test-model"]!, id: "other/test-model" };
    expect(() => modelParameters(data, current)).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() => modelParameters(data, { ...current, modelId: "lab/test-model" })).toThrow(expect.objectContaining({ code: "conflict" }));
  });

  // Parameter lookup strips prefixes, but saving and requests retain the complete modelId required by the relay.
  it("strips all routing prefixes for lookup while preserving saved model IDs, global references, and compatibility settings", () => {
    const data: Catalog = { providers: {}, models: {
      "lab/vendor/model": { id: "lab/vendor/model", name: "Model", description: "", reasoning: true, tool_call: true },
    } };
    for (const modelId of ["model", "vendor/model", "route/vendor/model"]) {
      const model = { ...current, providerId: "my-provider", modelId };
      const result = modelParameters(data, model);
      expect(result.report.source).toBe("lab/vendor/model");
      expect(result.value.modelId).toBe(modelId);
      expect(modelReference(result.value)).toBe(`my-provider/${modelId}`);
      expect(result.value.compatibility).toEqual(model.compatibility);
    }
    for (const modelId of ["vendor/", "vendor/model-thinking", "vendor/MODEL"])
      expect(() => modelParameters(data, { ...current, modelId })).toThrow(expect.objectContaining({ code: "not_found" }));
  });

  // Capability toggles and budgets are not level lists; missing values must neither clear fields nor imply complete retrieval.
  it("budgets and toggles cannot fabricate levels; missing and unsupported fields appear in the report", () => {
    const data: Catalog = { providers: {}, models: {
      "lab/test-model": { id: "lab/test-model", name: "Model", description: "", reasoning: true, tool_call: false },
    } };
    const result = modelParameters(data, current);
    expect(result.value.contextWindow).toBe(current.contextWindow);
    expect(result.value.capabilities.thinkingLevels).toEqual(current.capabilities.thinkingLevels);
    expect(result.report.unfilled).toEqual(["contextWindow", "maxOutputTokens", "thinkingLevels", "cost"]);
    const budget = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "budget_tokens", min: 1024 }, { type: "toggle" }] }), current);
    expect(budget.report.unfilled).toEqual(["thinkingLevels"]);
    const partial = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "effort", values: ["default", "high"] }] }), current);
    expect(partial.value.capabilities.thinkingLevels).toEqual(current.capabilities.thinkingLevels);
    expect(partial.report.unfilled).toEqual(["thinkingLevels"]);
    expect(() => modelParameters(catalog({ ...entry, limit: { context: -1, output: 32000 } }), current))
      .toThrow(expect.objectContaining({ code: "unavailable" }));
  });

  // Prices are original-model API reference data; map them to an independent contract preserving zero prices, unknowns, and all tiers.
  it("converts reference unit prices and arbitrary input thresholds, sorts by threshold, and does not inherit missing tier prices", () => {
    const result = modelParameters(catalog({ ...entry, cost: {
      input: 0, output: 10, cache_read: 0, cache_write: 2.5, reasoning: 12, input_audio: 3, output_audio: 15,
      tiers: [
        { tier: { type: "context", size: 272000 }, input: 5, output: 22.5, cache_read: 0.5 },
        { tier: { type: "context", size: 128000 }, input: 3, output: 15 },
      ],
      context_over_200k: { input: 99, output: 99 },
    } }), current);
    expect(result.value.cost).toEqual({
      currency: "USD",
      rates: {
        text: { input: { amount: 0, ...perMillion }, output: { amount: 10, ...perMillion },
          cacheRead: { amount: 0, ...perMillion }, cacheWrite: { amount: 2.5, ...perMillion }, reasoning: { amount: 12, ...perMillion } },
        audio: { ...emptyModalityRates(), input: { amount: 3, ...perMillion }, output: { amount: 15, ...perMillion } },
        image: emptyModalityRates(), video: emptyModalityRates(),
      },
      tiers: [
        { fromInputTokens: 128000, rates: { ...emptyModelRates(), text: { ...emptyModalityRates(), input: { amount: 3, ...perMillion }, output: { amount: 15, ...perMillion } } } },
        { fromInputTokens: 272000, rates: { ...emptyModelRates(), text: { ...emptyModalityRates(),
          input: { amount: 5, ...perMillion }, output: { amount: 22.5, ...perMillion }, cacheRead: { amount: 0.5, ...perMillion } } } },
      ],
    });
    expect(result.report.unfilled).toEqual([]);
  });

  // Legacy fields mean strictly above 200k; new fields preserve inclusive starts from the catalog rather than collapsing arbitrary thresholds to 200k.
  it("converts legacy-only tiers to a 200001 start while preferring a newer empty tier list", () => {
    const cost = { input: 1, output: 2, context_over_200k: { input: 3, output: 4 } };
    expect(modelParameters(catalog({ ...entry, cost }), current).value.cost?.tiers)
      .toEqual([{ fromInputTokens: 200001, rates: { ...emptyModelRates(), text: { ...emptyModalityRates(),
        input: { amount: 3, ...perMillion }, output: { amount: 4, ...perMillion } } } }]);
    expect(modelParameters(catalog({ ...entry, cost: { ...cost, tiers: [] } }), current).value.cost?.tiers).toEqual([]);
  });

  // Unrepresentable pricing rules cannot silently simplify to base prices; preserve all old pricing without blocking other valid parameter updates.
  it("preserves and reports missing, invalid, or unknown pricing rules while allowing valid zero prices to override", () => {
    const previous: ModelCost = { currency: "USD", rates: { ...emptyModelRates(), text: { ...emptyModalityRates(),
      input: { amount: 9, ...perMillion }, output: { amount: 20, ...perMillion } } }, tiers: [] };
    const tier = { tier: { type: "context", size: 100000 }, input: 3, output: 4 };
    const cases: unknown[] = [
      undefined, { input: -1, output: 2 }, { input: 1, output: 2, tiers: [tier, tier] },
      { input: 1, output: 2, tiers: [{ ...tier, tier: { type: "monthly", size: 100000 } }] },
      { input: 1, output: 2, per_request: 5 },
    ];
    for (const cost of cases) {
      const result = modelParameters(catalog({ ...entry, cost } as Model), { ...current, cost: previous });
      expect(result.value.cost).toEqual(previous);
      expect(result.value.contextWindow).toBe(200000);
      expect(result.report.unfilled).toEqual(["cost"]);
    }
    expect(modelParameters(catalog({ ...entry, cost: { input: 0, output: 0 } }), { ...current, cost: previous }).value.cost)
      .toEqual({ currency: "USD", rates: { ...emptyModelRates(), text: { ...emptyModalityRates(),
        input: { amount: 0, ...perMillion }, output: { amount: 0, ...perMillion } } }, tiers: [] });
  });

  // The official client accesses only the public catalog; provider credentials and model IDs need not reach models.dev.
  it("the official SDK fetches the complete catalog without auth headers, query leaks, or redirects", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(catalog()));
    vi.stubGlobal("fetch", transport);
    const signal = new AbortController().signal;
    expect(await loadModelCatalog(signal)).toEqual(catalog());
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe("https://models.dev/catalog.json");
    expect([...new Headers(init?.headers)]).toEqual([]);
    expect(init).toMatchObject({ signal, redirect: "error" });
  });
});
