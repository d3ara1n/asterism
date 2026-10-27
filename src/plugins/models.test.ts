import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@asterism/sdk/contracts";
import { ModelConfiguration, resolveAgentModelSelection } from "@asterism/builtin-api/contracts";
import { defaultAgents, defaultRoles } from "../configuration/defaults.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { createSelection } from "../../packages/builtin/src/agent/selection.ts";
import { agentSelectionSchema } from "../shared/model.ts";
import { availableThinkingLevels, resolveAgentModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { resolveTarget } from "./models.ts";

function configuration(): ConfigurationSnapshot {
  return {
    webProviders: [], webProviderTypes: [],
    agents: defaultAgents.map(agent => ({ ...agent })),
    roles: defaultRoles.map(role => ({ ...role, model: "p/test", thinking: "high" })),
    modelProviders: [{ id: "p", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", compatibility: [], credentialState: "not_required" }],
    models: [{ providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] },
      generation: { temperature: null, topP: null, maxOutputTokens: 8192 } }],
    defaults: { agents: {}, roles: {} }, overrides: { agents: {}, roles: {} }, tests: [], discoveries: [], credentialStorageAvailable: false,
  };
}

// Model configuration contract: empty selections inherit by layer, level sets affect menus only, and upstream decides explicit-level acceptance.
describe("Model selection inheritance and request resolution", () => {
  it("summaries and requests independently resolve the same configuration, preserve empty inheritance, honor role changes, and never fall back from invalid models", () => {
    const config = configuration();
    const service = createSelection({ agents: () => config.agents });
    const selection = agentSelectionSchema.parse({ agent: "worker", model: null, thinking: null });
    expect(() => service.validate(selection)).not.toThrow();
    const target = service.target(selection);
    expect(resolveTarget(config, target)).toEqual({ ok: true, model: "p/test", thinking: "high" });
    const display = (value = selection) => resolveAgentModelSelection(ModelConfiguration.schema.parse(config), value);
    expect(display()).toMatchObject({
      reference: "p/test", model: { name: "Test", generation: { maxOutputTokens: 8192 } }, thinking: "high",
    });
    config.roles.find(role => role.id === "default")!.thinking = "low";
    expect(resolveTarget(config, target)).toMatchObject({ thinking: "low" });
    expect(display().thinking).toBe("low");
    expect(resolveTarget(config, { ...target, thinking: "off" })).toMatchObject({ thinking: "off" });
    expect(display({ ...selection, thinking: "off" }).thinking).toBe("off");
    expect(() => service.validate({ ...selection, model: "p/missing" })).not.toThrow();
    expect(resolveTarget(config, { ...target, model: "p/missing" })).toEqual({ ok: false, reason: "model_unavailable" });
    expect(display({ ...selection, model: "p/missing" })).toMatchObject({ reference: "p/missing", model: null });
    config.roles.find(role => role.id === "default")!.model = null;
    expect(resolveTarget(config, target)).toEqual({ ok: false, reason: "model_unavailable" });
    expect(display()).toMatchObject({ reference: null, model: null });
    expect(selection).toEqual({ agent: "worker", model: null, thinking: null });
  });

  // Model configuration contract: disabled roles cannot resolve, and explicit model overrides cannot revive invalid roles.
  it("summaries do not show explicit models under disabled roles as available", () => {
    const config = configuration();
    config.roles.find(role => role.id === "default")!.enabled = false;
    const selection = { agent: "worker", model: "p/test", thinking: null };
    expect(resolveTarget(config, createSelection({ agents: () => config.agents }).target(selection)))
      .toEqual({ ok: false, reason: "role_unavailable" });
    expect(resolveAgentModelSelection(ModelConfiguration.schema.parse(config), selection))
      .toMatchObject({ reference: "p/test", model: null });
  });

  it.each([
    { override: null, inherited: "high", levels: ["off"] },
    { override: "high", inherited: "off", levels: ["off"] },
    { override: null, inherited: null, levels: [...thinkingLevels] },
    { override: "off", inherited: "high", levels: [] },
  ] as { override: ThinkingLevel | null; inherited: ThinkingLevel | null; levels: ThinkingLevel[] }[])(
    "level $override / inherited $inherited is not rejected or replaced by the available set", ({ override, inherited, levels }) => {
      const config = configuration();
      config.models[0]!.capabilities.thinkingLevels = levels;
      config.roles.find(role => role.id === "default")!.thinking = inherited;
      const service = createSelection({ agents: () => config.agents });
      const selection = { agent: "worker", model: null, thinking: override };
      expect(() => service.validate(selection)).not.toThrow();
      const result = resolveTarget(config, service.target(selection));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Unexpected resolution failure");
      expect(result.thinking).toBe(override ?? inherited);
      expect(resolveAgentModelSelection(ModelConfiguration.schema.parse(config), selection).thinking).toBe(result.thinking);
      const input = { settings: { provider: config.modelProviders[0]!, model: config.models[0]!, thinking: result.thinking },
        system: { blocks: [] }, messages: [], tools: [] };
      const adapter = new AiSdkAdapter(async () => { throw new Error("Validation must not read credentials"); });
      expect(() => adapter.validate(input)).not.toThrow();
      expect(selection.thinking).toBe(override);
    });

  it("menus filter by inherited model; off is an ordinary level, empty sets have none, and selections are not rewritten", () => {
    const config = configuration();
    const selection = { agent: "worker", model: null, thinking: null };
    const model = resolveAgentModel(config, selection)!;
    model.capabilities.thinkingLevels = ["off"];
    expect(availableThinkingLevels(model)).toEqual(["off"]);
    model.capabilities.thinkingLevels = [];
    expect(availableThinkingLevels(model)).toEqual([]);
    model.capabilities.thinkingLevels = [...thinkingLevels];
    model.capabilities.reasoning = false;
    expect(availableThinkingLevels(model)).toEqual([]);
    expect(selection).toEqual({ agent: "worker", model: null, thinking: null });
  });
});
