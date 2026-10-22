import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@atelier/sdk/contracts";
import { ModelConfiguration, resolveAgentModelSelection } from "@atelier/builtin-api/contracts";
import { defaultAgents, defaultRoles } from "../configuration/defaults.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { createSelection } from "../../packages/builtin/src/agent/selection.ts";
import { agentSelectionSchema } from "../shared/model.ts";
import { availableThinkingLevels, resolveAgentModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { resolveTarget } from "./models.ts";

function configuration(): ConfigurationSnapshot {
  return {
    agents: defaultAgents.map(agent => ({ ...agent })),
    roles: defaultRoles.map(role => ({ ...role, model: "p/test", thinking: "high" })),
    providers: [{ id: "p", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", compatibility: [], credentialState: "not_required" }],
    models: [{ providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] },
      generation: { temperature: null, topP: null, maxOutputTokens: 8192 } }],
    defaults: { agents: {}, roles: {} }, overrides: { agents: {}, roles: {} }, tests: [], discoveries: [], credentialStorageAvailable: false,
  };
}

// 模型配置契约：空选择逐层继承，保存不检查等级可用性，末端按本次模型能力拒绝。
describe("模型选择的继承与末端校验", () => {
  it("摘要与请求独立解析同一配置，空选择保留继承，角色修改生效，失效模型不回退", () => {
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

  // 模型配置契约：停用角色即不可解析，显式模型覆盖不能使失效角色重新可用。
  it("摘要不把停用角色下的显式模型显示为可用", () => {
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
      expect(resolveAgentModelSelection(ModelConfiguration.schema.parse(config), selection).thinking).toBe(result.thinking);
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
