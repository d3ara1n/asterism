import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@atelier/sdk/contracts";
import { defaultAgents, defaultRoles } from "../configuration/defaults.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { createSelection } from "../modules/agent/selection.ts";
import { agentSelectionSchema } from "../shared/model.ts";
import { availableThinkingLevels, resolveAgentModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { resolveTarget } from "./models.ts";

function configuration(): ConfigurationSnapshot {
  return {
    agents: defaultAgents.map(agent => ({ ...agent, revision: 1 })),
    roles: defaultRoles.map(role => ({ ...role, revision: 1, model: "p/test", thinking: "high" })),
    providers: [{ id: "p", revision: 1, name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", compatibility: [], credentialState: "not_required" }],
    models: [{ revision: 1, providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] },
      generation: { temperature: null, topP: null, maxOutputTokens: null } }],
    defaults: { agents: {}, roles: {} }, overrides: { agents: {}, roles: {} }, tests: [], discoveries: [], credentialStorageAvailable: false,
  };
}

// 模型配置契约：空选择逐层继承，保存不检查等级可用性，末端按本次模型能力拒绝。
describe("模型选择的继承与末端校验", () => {
  it("空模型与等级保留到请求，角色修改影响下一次解析，失效模型不回退", () => {
    const config = configuration();
    const service = createSelection({ agents: () => config.agents });
    const selection = agentSelectionSchema.parse({ agent: "worker", model: null, thinking: null });
    expect(() => service.validate(selection)).not.toThrow();
    const target = service.target(selection);
    expect(resolveTarget(config, target)).toEqual({ ok: true, model: "p/test", thinking: "high" });
    config.roles.find(role => role.id === "default")!.thinking = "low";
    expect(resolveTarget(config, target)).toMatchObject({ thinking: "low" });
    expect(resolveTarget(config, { ...target, thinking: "off" })).toMatchObject({ thinking: "off" });
    expect(() => service.validate({ ...selection, model: "p/missing" })).not.toThrow();
    expect(resolveTarget(config, { ...target, model: "p/missing" })).toEqual({ ok: false, reason: "model_unavailable" });
    config.roles.find(role => role.id === "default")!.model = null;
    expect(resolveTarget(config, target)).toEqual({ ok: false, reason: "model_unavailable" });
  });

  it.each([
    { override: null, inherited: "high", levels: ["off"] },
    { override: "high", inherited: "off", levels: ["off"] },
    { override: null, inherited: null, levels: [...thinkingLevels] },
    { override: "off", inherited: "high", levels: [] },
  ] as { override: ThinkingLevel | null; inherited: ThinkingLevel | null; levels: ThinkingLevel[] }[])(
    "等级 $override / 继承 $inherited 到末端才检查，不回退到其他等级", ({ override, inherited, levels }) => {
      const config = configuration();
      config.models[0]!.capabilities.thinkingLevels = levels;
      config.roles.find(role => role.id === "default")!.thinking = inherited;
      const service = createSelection({ agents: () => config.agents });
      const selection = { agent: "worker", model: null, thinking: override };
      expect(() => service.validate(selection)).not.toThrow();
      const result = resolveTarget(config, service.target(selection));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Unexpected resolution failure");
      const input = { settings: { provider: config.providers[0]!, model: config.models[0]!, thinking: result.thinking },
        system: { blocks: [] }, messages: [], tools: [] };
      const adapter = new AiSdkAdapter(async () => { throw new Error("Validation must not read credentials"); });
      expect(() => adapter.validate(input)).toThrow(expect.objectContaining({ code: "thinking_unavailable" }));
      input.settings.model.capabilities.reasoning = false;
      expect(() => adapter.validate(input)).not.toThrow();
      expect(selection.thinking).toBe(override);
    });

  it("菜单按继承模型过滤；off 是普通可选等级，空集没有等级，选择不被改写", () => {
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
