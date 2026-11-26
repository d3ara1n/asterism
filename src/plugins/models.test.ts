import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@asterism-app/sdk/contracts";
import type { ConfigurationSnapshot } from "../shared/configuration.ts";
import { resolveLanguageModelTarget } from "./models.ts";

function configuration(): Pick<ConfigurationSnapshot, "languageModelProviders" | "languageModels"> {
  return {
    languageModelProviders: [{ id: "p", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", compatibility: [], apiKey: "" }],
    languageModels: [{ providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] },
      generation: { temperature: null, topP: null, maxOutputTokens: 8192 } }],
  };
}
describe("Concrete model targets", () => {
  it("does not reinterpret a provider slash as part of another provider's model ID", () => {
    const config = configuration();
    config.languageModels[0]!.modelId = "nested/test";
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "nested/test" })).toEqual({ ok: true, model: "p/nested/test", thinking: null });
    expect(resolveLanguageModelTarget(config, { provider: "p/nested", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
  });
  it("resolves only the requested pair and retains explicit thinking independently of the menu", () => {
    const config = configuration();
    config.languageModels[0]!.capabilities.thinkingLevels = ["off"];
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "test", thinking: "high" })).toEqual({ ok: true, model: "p/test", thinking: "high" });
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "test" })).toEqual({ ok: true, model: "p/test", thinking: null });
    expect(resolveLanguageModelTarget(config, { provider: "missing", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "missing" })).toEqual({ ok: false, reason: "model_unavailable" });
    config.languageModelProviders[0]!.enabled = false;
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
  });
  it("requires credentials for authenticated providers without changing the selected target", () => {
    const config = configuration();
    config.languageModelProviders[0]!.auth = "api_key";
    config.languageModelProviders[0]!.apiKey = "";
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "test" })).toEqual({ ok: false, reason: "credential_unavailable" });
    config.languageModelProviders[0]!.apiKey = "key";
    expect(resolveLanguageModelTarget(config, { provider: "p", model: "test", thinking: "off" })).toEqual({ ok: true, model: "p/test", thinking: "off" });
  });
});
