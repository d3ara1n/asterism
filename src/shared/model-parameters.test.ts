import { describe, expect, it } from "vitest";
import { emptyModelRates } from "@asterism-app/sdk/contracts";
import { applyModelParameters, createModelInput, type ProviderModel } from "./configuration.ts";

const draft: ProviderModel = {
  ...createModelInput("relay", { modelId: "route/model", name: "" }),
  contextWindow: 1000,
  capabilities: { reasoning: true, tools: true, thinkingLevels: ["off", "high"] },
  generation: { temperature: 0.5, topP: 0.9, maxOutputTokens: 100 },
  compatibility: [{ id: "systemMessageInMessages" }],
  cost: { currency: "USD", rates: emptyModelRates(), tiers: [] },
};

describe("catalog parameters as draft edits", () => {
  it("overwrites returned fields while retaining missing fields and unrelated unsaved edits", () => {
    const original = structuredClone(draft);
    const filled = applyModelParameters(draft, {
      contextWindow: 200000, capabilities: { reasoning: false, thinkingLevels: [] },
      generation: { maxOutputTokens: 32000 },
    });
    expect(filled).toEqual({
      ...original, contextWindow: 200000,
      capabilities: { reasoning: false, tools: true, thinkingLevels: [] },
      generation: { temperature: 0.5, topP: 0.9, maxOutputTokens: 32000 },
    });
    expect(draft).toEqual(original);
    expect(JSON.stringify(filled)).not.toBe(JSON.stringify(draft));
  });

  it("replaces pricing as a whole instead of retaining obsolete tiers", () => {
    const previous: ProviderModel = { ...draft, cost: {
      currency: "USD", rates: emptyModelRates(), tiers: [{ fromInputTokens: 200001, rates: emptyModelRates() }],
    } };
    const cost = { currency: "USD" as const, rates: emptyModelRates(), tiers: [] };
    const filled = applyModelParameters(previous, { cost, capabilities: {}, generation: {} });
    expect(filled.cost).toEqual(cost);
    expect(previous.cost?.tiers).toHaveLength(1);
  });

  it("keeps the draft comparison unchanged when catalog values already match", () => {
    const filled = applyModelParameters(draft, {
      contextWindow: 1000, cost: structuredClone(draft.cost!),
      capabilities: { reasoning: true, tools: true, thinkingLevels: ["off", "high"] },
      generation: { maxOutputTokens: 100 },
    });
    expect(JSON.stringify(filled)).toBe(JSON.stringify(draft));
  });
});
