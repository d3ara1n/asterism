import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, Model } from "@opencode-ai/models";
import { loadModelCatalog, modelParameters } from "./model-catalog.ts";
import { emptyModelRates, emptyModalityRates } from "@asterism-app/sdk/contracts";

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

describe("models.dev parameter lookup", () => {
  it("maps supported fields by model ID, including explicit capability disablement", () => {
    const { parameters, ...report } = modelParameters(catalog(), "test-model");
    expect(parameters).toMatchObject({
      contextWindow: 200000, capabilities: { reasoning: true, tools: true, thinkingLevels: ["off", "low", "high"] },
      generation: { maxOutputTokens: 32000 },
    });
    expect(report).toEqual({ source: "lab/test-model", unfilled: [] });
    const disabled = modelParameters(catalog({ ...entry, reasoning: false, tool_call: false, reasoning_options: undefined }), "test-model");
    expect(disabled.parameters.capabilities).toEqual({ reasoning: false, tools: false, thinkingLevels: [] });
  });

  // Reference parameters for a model ID do not vary by connection; relay records are excluded and ambiguous IDs do not arbitrarily select the first match.
  it("matches original models solely by model ID, ignores connection and relay overrides, and rejects ambiguous IDs and tricky aliases", () => {
    const data = catalog();
    data.providers.relay = { ...data.providers.lab!, id: "relay", api: "https://relay.test/v1",
      models: { "test-model": { ...entry, limit: { context: 100, output: 10 }, reasoning_options: [{ type: "effort", values: ["high"] }] } } };
    const result = modelParameters(data, "test-model");
    expect(result.source).toBe("lab/test-model");
    expect(result.parameters.contextWindow).toBe(200000);
    expect(result.parameters.capabilities.thinkingLevels).toEqual(["off", "low", "high"]);
    expect(modelParameters(data, "lab/test-model").source).toBe("lab/test-model");
    expect(() => modelParameters(data, "test-model-thinking-latest")).toThrow(expect.objectContaining({ code: "not_found" }));
    data.models["other/test-model"] = { ...data.models["lab/test-model"]!, id: "other/test-model" };
    expect(() => modelParameters(data, "test-model")).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() => modelParameters(data, "lab/test-model")).toThrow(expect.objectContaining({
      code: "conflict", display: expect.objectContaining({ values: { modelId: "test-model" } }),
    }));
  });

  it("strips all routing prefixes for exact lookup without accepting suffix or case aliases", () => {
    const data: Catalog = { providers: {}, models: {
      "lab/vendor/model": { id: "lab/vendor/model", name: "Model", description: "", reasoning: true, tool_call: true },
    } };
    for (const modelId of ["model", "vendor/model", "route/vendor/model"]) {
      expect(modelParameters(data, modelId).source).toBe("lab/vendor/model");
    }
    for (const modelId of ["vendor/", "vendor/model-thinking", "vendor/MODEL"])
      expect(() => modelParameters(data, modelId)).toThrow(expect.objectContaining({
        code: "not_found", display: expect.objectContaining({ values: { modelId: modelId.slice("vendor/".length) } }),
      }));
  });

  // Capability toggles and budgets are not level lists; missing values must neither clear fields nor imply complete retrieval.
  it("budgets and toggles cannot fabricate levels; missing and unsupported fields appear in the report", () => {
    const data: Catalog = { providers: {}, models: {
      "lab/test-model": { id: "lab/test-model", name: "Model", description: "", reasoning: true, tool_call: false },
    } };
    const result = modelParameters(data, "test-model");
    expect(result.parameters).toEqual({ capabilities: { reasoning: true, tools: false }, generation: {} });
    expect(result.unfilled).toEqual(["contextWindow", "maxOutputTokens", "thinkingLevels", "cost"]);
    const budget = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "budget_tokens", min: 1024 }, { type: "toggle" }] }), "test-model");
    expect(budget.unfilled).toEqual(["thinkingLevels"]);
    const partial = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "effort", values: ["default", "high"] }] }), "test-model");
    expect(partial.parameters.capabilities.thinkingLevels).toBeUndefined();
    expect(partial.unfilled).toEqual(["thinkingLevels"]);
    expect(() => modelParameters(catalog({ ...entry, limit: { context: -1, output: 32000 } }), "test-model"))
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
    } }), "test-model");
    expect(result.parameters.cost).toEqual({
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
    expect(result.unfilled).toEqual([]);
  });

  // Legacy fields mean strictly above 200k; new fields preserve inclusive starts from the catalog rather than collapsing arbitrary thresholds to 200k.
  it("converts legacy-only tiers to a 200001 start while preferring a newer empty tier list", () => {
    const cost = { input: 1, output: 2, context_over_200k: { input: 3, output: 4 } };
    expect(modelParameters(catalog({ ...entry, cost }), "test-model").parameters.cost?.tiers)
      .toEqual([{ fromInputTokens: 200001, rates: { ...emptyModelRates(), text: { ...emptyModalityRates(),
        input: { amount: 3, ...perMillion }, output: { amount: 4, ...perMillion } } } }]);
    expect(modelParameters(catalog({ ...entry, cost: { ...cost, tiers: [] } }), "test-model").parameters.cost?.tiers).toEqual([]);
  });

  // Unrepresentable pricing rules cannot silently simplify to base prices or clear existing prices.
  it("omits and reports missing, invalid, or unknown pricing rules while returning valid zero prices", () => {
    const tier = { tier: { type: "context", size: 100000 }, input: 3, output: 4 };
    const cases: unknown[] = [
      undefined, { input: -1, output: 2 }, { input: 1, output: 2, tiers: [tier, tier] },
      { input: 1, output: 2, tiers: [{ ...tier, tier: { type: "monthly", size: 100000 } }] },
      { input: 1, output: 2, per_request: 5 },
    ];
    for (const cost of cases) {
      const result = modelParameters(catalog({ ...entry, cost } as Model), "test-model");
      expect(result.parameters).not.toHaveProperty("cost");
      expect(result.parameters.contextWindow).toBe(200000);
      expect(result.unfilled).toEqual(["cost"]);
    }
    expect(modelParameters(catalog({ ...entry, cost: { input: 0, output: 0 } }), "test-model").parameters.cost)
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
