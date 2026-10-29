import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@asterism-app/sdk/contracts";
import type { ConfigurationSnapshot } from "../shared/configuration.ts";
import { resolveTarget } from "./models.ts";

function configuration(): Pick<ConfigurationSnapshot, "modelProviders" | "models"> {
  return {
    modelProviders: [{ id: "p", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", compatibility: [], credentialState: "not_required" }],
    models: [{ providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] },
      generation: { temperature: null, topP: null, maxOutputTokens: 8192 } }],
  };
}
describe("Concrete model targets", () => {
  it("does not reinterpret a provider slash as part of another provider's model ID", () => {
    const config = configuration();
    config.models[0]!.modelId = "nested/test";
    expect(resolveTarget(config, { provider: "p", model: "nested/test" })).toEqual({ ok: true, model: "p/nested/test", thinking: null });
    expect(resolveTarget(config, { provider: "p/nested", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
  });
  it("resolves only the requested pair and retains explicit thinking independently of the menu", () => {
    const config = configuration();
    config.models[0]!.capabilities.thinkingLevels = ["off"];
    expect(resolveTarget(config, { provider: "p", model: "test", thinking: "high" })).toEqual({ ok: true, model: "p/test", thinking: "high" });
    expect(resolveTarget(config, { provider: "p", model: "test" })).toEqual({ ok: true, model: "p/test", thinking: null });
    expect(resolveTarget(config, { provider: "missing", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
    expect(resolveTarget(config, { provider: "p", model: "missing" })).toEqual({ ok: false, reason: "model_unavailable" });
    config.modelProviders[0]!.enabled = false;
    expect(resolveTarget(config, { provider: "p", model: "test" })).toEqual({ ok: false, reason: "model_unavailable" });
  });
  it("requires credentials for authenticated providers without changing the selected target", () => {
    const config = configuration();
    config.modelProviders[0]!.auth = "api_key";
    config.modelProviders[0]!.credentialState = "missing";
    expect(resolveTarget(config, { provider: "p", model: "test" })).toEqual({ ok: false, reason: "credential_unavailable" });
    config.modelProviders[0]!.credentialState = "available";
    expect(resolveTarget(config, { provider: "p", model: "test", thinking: "off" })).toEqual({ ok: true, model: "p/test", thinking: "off" });
  });
});
