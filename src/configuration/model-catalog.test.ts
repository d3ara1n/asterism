import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, Model } from "@opencode-ai/models";
import { createModelInput, modelReference, type ProviderModel } from "../shared/configuration.ts";
import { loadModelCatalog, modelParameters } from "./model-catalog.ts";

const current: ProviderModel = {
  ...createModelInput("my-connection", { modelId: "test-model", name: "My model" }),
  revision: 3, contextWindow: 1000,
  generation: { maxOutputTokens: 100, temperature: 0.5, topP: 0.9 },
  compatibility: [{ id: "systemMessageInMessages" }],
};
const entry: Model = {
  id: "test-model", name: "Upstream name", description: "", reasoning: true, tool_call: true,
  attachment: false, modalities: { input: ["text"], output: ["text"] }, open_weights: false,
  release_date: "2026-01-01", last_updated: "2026-01-01",
  limit: { context: 200000, output: 32000 },
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

describe("models.dev 参数覆盖", () => {
  // 新建默认开启思考，但端点的明确 false 仍是有效配置。
  it("新建模型默认开启思考并保留端点明确关闭", () => {
    expect(createModelInput("local", { modelId: "new", name: "New" }).capabilities.reasoning).toBe(true);
    expect(createModelInput("local", { modelId: "new", name: "New", reasoning: false }).capabilities.reasoning).toBe(false);
  });
  // 用户明确获取即替换有效旧值；显示身份、兼容设置和未提供的生成参数不属于目录参数。
  it("按模型 ID 覆盖所有可映射字段并保留非目录配置", () => {
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

  // 相同模型 ID 的参考参数不随连接变化；中转站记录不参与选择，歧义 ID 不任意取第一条。
  it("只按模型 ID 匹配原模型，忽略连接与中转覆盖；歧义和刁钻别名报错", () => {
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

  // 参数查询剥离前缀，但保存与请求仍须携带中转站要求的完整 modelId。
  it("查询去掉所有路由前缀，保存的模型 ID、全局引用和兼容设置保持原样", () => {
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

  // 能力开关/预算不是等级列表，缺失的值不得清空，也不得宣称已经完整获取。
  it("预算或开关不能伪造等级；缺失和不支持的字段列入报告", () => {
    const data: Catalog = { providers: {}, models: {
      "lab/test-model": { id: "lab/test-model", name: "Model", description: "", reasoning: true, tool_call: false },
    } };
    const result = modelParameters(data, current);
    expect(result.value.contextWindow).toBe(current.contextWindow);
    expect(result.value.capabilities.thinkingLevels).toEqual(current.capabilities.thinkingLevels);
    expect(result.report.unfilled).toEqual(["contextWindow", "maxOutputTokens", "thinkingLevels"]);
    const budget = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "budget_tokens", min: 1024 }, { type: "toggle" }] }), current);
    expect(budget.report.unfilled).toEqual(["thinkingLevels"]);
    const partial = modelParameters(catalog({ ...entry, reasoning_options: [{ type: "effort", values: ["default", "high"] }] }), current);
    expect(partial.value.capabilities.thinkingLevels).toEqual(current.capabilities.thinkingLevels);
    expect(partial.report.unfilled).toEqual(["thinkingLevels"]);
    expect(() => modelParameters(catalog({ ...entry, limit: { context: -1, output: 32000 } }), current))
      .toThrow(expect.objectContaining({ code: "unavailable" }));
  });

  // 官方客户端只访问公开目录；提供商凭据与模型 ID 无需传给 models.dev。
  it("官方 SDK 获取完整目录，无认证头、无查询泄露、无重定向", async () => {
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
