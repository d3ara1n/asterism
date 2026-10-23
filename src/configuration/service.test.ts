import { thinkingLevels } from "@atelier/sdk/contracts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelInput, resolveModelRole, type ConfigurationSnapshot, type ProviderInput } from "../shared/configuration.ts";
import { providerPresetDraft } from "../shared/provider-presets.ts";
import { providerPresets } from "../../packages/builtin/src/providers/presets.ts";
import { ConfigurationService } from "./service.ts";
import type { ConnectionProbe } from "./probe.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";
import type { ModelCompatibility } from "../shared/model-compatibility.ts";
import type { DiscoverModels } from "./discovery.ts";
import type { LoadModelCatalog } from "./model-catalog.ts";
import type { Catalog } from "@opencode-ai/models";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.useRealTimers(); });
function setup(probe: ConnectionProbe = async () => {}, available = true, timeout = 30_000, discover?: DiscoverModels, catalog?: LoadModelCatalog) {
  const root = mkdtempSync(join(tmpdir(), "core-configuration-"));
  const ciphertexts = new Map<string, string>();
  const protector = {
    available: async () => available,
    encrypt: vi.fn(async (value: string) => { const opaque = randomUUID(); ciphertexts.set(opaque, value); return Buffer.from(opaque).toString("base64"); }),
    decrypt: vi.fn(async (encrypted: string) => { const value = ciphertexts.get(Buffer.from(encrypted, "base64").toString()); if (!value) throw new Error("Cannot decrypt"); return value; }),
  };
  const changed = vi.fn();
  const service = new ConfigurationService(root, protector, changed, probe, timeout, discover, catalog);
  cleanups.push(() => { service.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, service, protector, changed };
}
const providerValue = { id: "local", name: "Local", protocol: "openai-chat" as const, baseUrl: "http://127.0.0.1:1234/v1", enabled: true, auth: "none" as "none" | "api_key", compatibility: [] };
async function addModel(service: ConfigurationService, auth: "none" | "api_key" = "none") {
  const provider = await service.execute({ type: "provider.save", id: null, value: { ...providerValue, auth },
    credential: auth === "none" ? { action: "keep" } : { action: "replace", value: "test-key-not-for-network" } });
  const model = await service.execute({ type: "model.save", id: null, value: {
    providerId: provider.savedId!, name: "Test model", modelId: "test-model", enabled: true, contextWindow: 32000, cost: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { providerId: provider.savedId!, modelId: model.savedId!, snapshot: model.snapshot };
}
function roleValue(snapshot: ConfigurationSnapshot, id: string) {
  const { builtin: _builtin, ...value } = snapshot.roles.find(role => role.id === id)!;
  return value;
}

describe("真实配置与消费边界", () => {
  // 配置 ID 直接用于模型选择；新增重名不能覆盖旧项，改名必须替换原项且保留其行为覆盖。
  it.each(["agent", "role"] as const)("%s 以显式 slug 创建、拒绝重名并持久保存改名", async kind => {
    const { service, root, protector } = setup();
    const created = await service.execute({ type: `${kind}.save`, id: null, value: { id: "code-review", description: "Review code" } });
    expect(created.savedId).toBe("code-review");
    await expect(service.execute({ type: `${kind}.save`, id: null, value: { id: "code-review", description: "Overwrite" } }))
      .rejects.toMatchObject({ code: "conflict" });
    const renamed = await service.execute({ type: `${kind}.save`, id: "code-review", value: { id: "review-code", description: "Review code" } });
    const entries = kind === "agent" ? renamed.snapshot.agents : renamed.snapshot.roles;
    expect(entries.some(item => item.id === "code-review")).toBe(false);
    expect(entries.find(item => item.id === "review-code")).toMatchObject({ description: "Review code", builtin: false });
    const builtinId = kind === "agent" ? "worker" : "default";
    await expect(service.execute({ type: `${kind}.save`, id: builtinId, value: { id: "renamed-builtin" } }))
      .rejects.toMatchObject({ code: "invalid_request" });
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    const saved = kind === "agent" ? reopened.current().agents : reopened.current().roles;
    expect(saved.find(item => item.id === "review-code")).toEqual(entries.find(item => item.id === "review-code"));
  });
  // 编辑规则须随连接独立持久化；固定认证方式不能阻止改名、启停和凭据管理。
  it("预设固定项跨重开保留，连接身份和密钥仍可修改", async () => {
    const { service, root, protector } = setup();
    const value = { ...providerPresetDraft(providerPresets.find(preset => preset.id === "kimi")!), enabled: true };
    await service.execute({ type: "provider.save", id: null, value, credential: { action: "replace", value: "first-key" } });
    const renamed = { ...value, id: "personal-kimi", name: "Personal", enabled: false };
    await service.execute({ type: "provider.save", id: value.id, value: renamed, credential: { action: "replace", value: "replacement-key" } });
    const saved = service.current().providers[0]!;
    expect(saved).toMatchObject({ ...renamed, credentialState: "available" });
    expect(await service.executionCredential(saved.id)).toBe("replacement-key");
    expect(JSON.parse(readFileSync(join(root, "configuration.json"), "utf8")).providers[0]).not.toHaveProperty("kind");
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().providers[0]).toMatchObject(renamed);
    await reopened.execute({ type: "provider.save", id: renamed.id, value: { ...renamed, enabled: true }, credential: { action: "clear" } });
    expect(reopened.current().providers[0]).toMatchObject({ enabled: true, credentialState: "missing", fixedFields: value.fixedFields });
  });

  // 隐藏不等于不可改：命令边界须拒绝更改固定值或撤下规则，失败不污染配置和凭据。
  it("固定字段与规则不可通过保存命令改写，模型也不能覆盖固定兼容设置", async () => {
    const { service, root } = setup();
    const value = { ...providerPresetDraft(providerPresets.find(preset => preset.id === "kimi")!), enabled: true };
    await service.execute({ type: "provider.save", id: null, value, credential: { action: "replace", value: "original-key" } });
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    const changes: Partial<ProviderInput>[] = [
      { protocol: "openai-chat" }, { baseUrl: "https://relay.test/v1" }, { auth: "none" },
      { compatibility: [] }, { fixedFields: [] }, { fixedFields: undefined },
    ];
    for (const change of changes) {
      await expect(service.execute({ type: "provider.save", id: value.id, value: { ...value, ...change },
        credential: { action: "replace", value: "must-not-replace" } })).rejects.toMatchObject({
        code: "invalid_request", display: { id: "providerEditing.fixed" },
      });
    }
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    const saved = service.current().providers[0]!;
    expect(await service.executionCredential(saved.id)).toBe("original-key");
    expect(readdirSync(join(root, "credentials"))).toHaveLength(1);
    const model = createModelInput(value.id, { modelId: "test", name: "Test" });
    await expect(service.execute({ type: "model.save", id: null, value: { ...model,
      compatibility: [{ id: "responsesReasoning", value: { summary: true } }] } })).rejects.toMatchObject({ code: "invalid_request" });
    await service.execute({ type: "model.save", id: null, value: model });
    await service.execute({ type: "model.save", id: `${value.id}/test`, value: { ...model, name: "Renamed model" } });
    expect(service.current().models[0]).toMatchObject({ name: "Renamed model", compatibility: [] });
  });

  // 没有规则的旧连接保持自定义行为，即使命名或地址与预设相同；不自动接管现有配置。
  it("未声明规则的连接可修改全部接入字段", async () => {
    const { service, root, protector } = setup();
    const value = { ...providerValue, id: "kimi", baseUrl: "https://api.moonshot.ai/v1" };
    await service.execute({ type: "provider.save", id: null, value, credential: { action: "keep" } });
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().providers[0]?.fixedFields).toBeUndefined();
    const changed: ProviderInput = { ...value, protocol: "anthropic", baseUrl: "https://relay.test/v1", auth: "api_key",
      compatibility: [{ id: "customUserAgent", value: { userAgent: "Atelier" } }] };
    await reopened.execute({ type: "provider.save", id: value.id, value: changed, credential: { action: "replace", value: "custom-key" } });
    expect(reopened.current().providers[0]).toMatchObject(changed);
    const model = createModelInput(value.id, { modelId: "test", name: "Test" });
    await reopened.execute({ type: "model.save", id: null, value: { ...model, compatibility: [{ id: "systemMessageInMessages" }] } });
    expect(reopened.current().models[0]?.compatibility).toEqual([{ id: "systemMessageInMessages" }]);
  });

  // 参数获取在队列外等待，成功才原子保存；网络失败保留已保存配置。
  it("目录参数覆盖旧值并持久化，获取失败保留原值且返回明确提示", async () => {
    const data: Catalog = { providers: {}, models: { "lab/test-model": {
      id: "lab/test-model", name: "Test", description: "", reasoning: true, tool_call: false,
      limit: { context: 128000, output: 16000 },
    } } };
    data.providers.lab = { id: "lab", name: "Lab", env: [], npm: "@ai-sdk/openai", doc: "https://lab.test", models: {
      "test-model": { id: "test-model", name: "Test", description: "", reasoning: true, tool_call: false,
        attachment: false, modalities: { input: ["text"], output: ["text"] }, open_weights: false,
        release_date: "2026-01-01", last_updated: "2026-01-01", limit: { context: 128000, output: 16000 },
        cost: { input: 1, output: 2, tiers: [{ tier: { type: "context", size: 64000 }, input: 3, output: 4 }] } },
    } };
    const catalog = vi.fn<LoadModelCatalog>(async () => data);
    const { service, root, protector } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId } = await addModel(service);
    const updated = await service.execute({ type: "model.parameters", model: modelId });
    expect(updated.snapshot.models[0]).toMatchObject({
      contextWindow: 128000, capabilities: { reasoning: true, tools: false }, generation: { maxOutputTokens: 16000 },
      cost: { currency: "USD", rates: { text: {
        input: { amount: 1, unit: "token", per: 1_000_000 }, output: { amount: 2, unit: "token", per: 1_000_000 },
      } }, tiers: [{ fromInputTokens: 64000, rates: { text: {
        input: { amount: 3, unit: "token", per: 1_000_000 }, output: { amount: 4, unit: "token", per: 1_000_000 },
      } } }] },
    });
    expect(updated.parameterUpdate).toEqual({ source: "lab/test-model", unfilled: ["thinkingLevels"] });
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().models).toEqual(updated.snapshot.models);
    catalog.mockRejectedValueOnce(new Error("Sensitive upstream diagnostic"));
    await expect(service.execute({ type: "model.parameters", model: modelId }))
      .rejects.toMatchObject({ code: "unavailable", message: "Model catalog request failed.", display: { id: "modelCatalog.failed" } });
    expect(service.current().models).toEqual(updated.snapshot.models);
  });

  // 添加可选价格资料不得让已有配置无法打开，也不能把缺失价格当成零价或改写原文件。
  it("没有 cost 字段的已有模型读取为未知价格", async () => {
    const { service, root, protector } = setup();
    await addModel(service);
    service.close();
    const path = join(root, "configuration.json");
    const document = JSON.parse(readFileSync(path, "utf8"));
    delete document.models[0].cost;
    const original = JSON.stringify(document);
    writeFileSync(path, original);
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().models[0]?.cost).toBeNull();
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  // 存储边界转换旧单价但不重写读取文件；显式保存后须持久化新单位，不能恢复成百万 token。
  it("旧平铺价格读取为明确单位，编辑后按模态和单位持久化", async () => {
    const { service, root, protector } = setup();
    const { modelId } = await addModel(service);
    service.close();
    const path = join(root, "configuration.json");
    const document = JSON.parse(readFileSync(path, "utf8"));
    const rates = { input: 1, output: 2, cacheRead: 0, cacheWrite: null, reasoning: 3,
      inputAudio: 4, outputAudio: null, inputImage: null, outputImage: 5, inputVideo: 6, outputVideo: 7 };
    document.models[0].cost = { currency: "USD", rates, tiers: [{ fromInputTokens: 200000, rates: { ...rates, input: 8 } }] };
    const original = JSON.stringify(document);
    writeFileSync(path, original);
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    const model = reopened.current().models[0]!;
    expect(model.cost).toMatchObject({
      rates: {
        text: { input: { amount: 1, unit: "token", per: 1_000_000 }, cacheRead: { amount: 0, unit: "token", per: 1_000_000 }, cacheWrite: null },
        image: { output: { amount: 5, unit: "token", per: 1_000_000 } },
        audio: { input: { amount: 4, unit: "token", per: 1_000_000 } },
        video: { input: { amount: 6, unit: "token", per: 1_000_000 }, output: { amount: 7, unit: "token", per: 1_000_000 } },
      },
      tiers: [{ fromInputTokens: 200000, rates: { text: { input: { amount: 8, unit: "token", per: 1_000_000 } } } }],
    });
    expect(readFileSync(path, "utf8")).toBe(original);
    model.cost!.rates.image.output = { amount: 0.04, unit: "image", per: 1 };
    model.cost!.rates.audio.input = { amount: 0.006, unit: "second", per: 60 };
    await reopened.execute({ type: "model.save", id: modelId, value: model });
    const saved = JSON.parse(readFileSync(path, "utf8")).models[0].cost;
    expect(saved).toEqual(model.cost);
    reopened.close();
    const final = new ConfigurationService(root, protector);
    cleanups.push(() => final.close());
    expect(final.current().models[0]?.cost).toEqual(model.cost);
  });

  // 参数契约要求合并当前模型：期间改名保留，目录提供的参数后写生效；关闭仍取消请求。
  it("目录等待不阻塞配置，返回后合并当前模型，退出取消请求", async () => {
    let finish!: (catalog: Catalog) => void;
    let signal!: AbortSignal;
    const catalog: LoadModelCatalog = input => { signal = input; return new Promise(resolve => { finish = resolve; }); };
    const { service } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId } = await addModel(service);
    const request = service.execute({ type: "model.parameters", model: modelId });
    const snapshot = (await service.execute({ type: "read" })).snapshot;
    const value = snapshot.models[0]!;
    await service.execute({ type: "model.save", id: modelId, value: { ...value, name: "Renamed", contextWindow: 777 } });
    finish({ providers: {}, models: { "lab/test-model": {
      id: "lab/test-model", name: "Test", description: "", limit: { context: 64000 },
    } } });
    expect((await request).snapshot.models[0]).toMatchObject({ name: "Renamed", contextWindow: 64000 });
    const second = service.execute({ type: "model.parameters", model: modelId });
    const closed = expect(second).rejects.toMatchObject({ code: "unavailable" });
    await service.execute({ type: "read" });
    service.close();
    expect(signal.aborted).toBe(true);
    finish({ providers: {}, models: {} });
    await closed;
  });
  // 参数返回时模型不存在属于真实 not_found，不创建记录或用 conflict 代替。
  it("参数返回时模型已删除，返回 not_found", async () => {
    let finish!: (catalog: Catalog) => void;
    const catalog: LoadModelCatalog = () => new Promise(resolve => { finish = resolve; });
    const { service } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId } = await addModel(service);
    const request = service.execute({ type: "model.parameters", model: modelId });
    const rejected = expect(request).rejects.toMatchObject({ code: "not_found" });
    await service.execute({ type: "remove", kind: "model", id: modelId });
    finish({ providers: {}, models: {} });
    await rejected;
    expect(service.current().models).toEqual([]);
  });

  // 两层独立保存显式条目；参考协议不拦截保存，非法候选不能污染已保存数据。
  it.each(["provider", "model"] as const)("%s 兼容条目独立保存并重开，非法条目拒绝且移除后不重现", async kind => {
    const { service, root, protector } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const value = snapshot.models[0]!;
    const save = (target: ConfigurationService, compatibility: ModelCompatibility[]) => kind === "provider"
      ? target.execute({ type: "provider.save", id: providerId, value: { ...providerValue, compatibility }, credential: { action: "keep" } })
      : target.execute({ type: "model.save", id: modelId, value: { ...value, compatibility } });
    const compatibility = [{ id: "responsesReasoning", value: {} }, { id: "systemMessageInMessages" }];
    await save(service, compatibility);
    for (const invalid of [
      [compatibility[0]!, compatibility[0]!],
      [{ id: "unknownCompatibility" }],
      [{ id: "responsesReasoning", value: false }],
    ]) {
      await expect(save(service, invalid)).rejects.toMatchObject({ code: "invalid_request" });
    }
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current()[kind === "provider" ? "providers" : "models"][0]?.compatibility).toEqual(compatibility);
    expect(reopened.current()[kind === "provider" ? "models" : "providers"][0]?.compatibility).toEqual([]);
    expect(reopened.current().providers[0]?.protocol).toBe("openai-chat");
    await save(reopened, []);
    const again = new ConfigurationService(root, protector);
    cleanups.push(() => again.close());
    expect(again.current()[kind === "provider" ? "providers" : "models"][0]?.compatibility).toEqual([]);
  });

  it("只保存用户覆盖，空提示词恢复内置，显式 false 与空列表不丢失", async () => {
    const { service } = setup();
    const initial = await service.execute({ type: "read" });
    expect(initial.snapshot.overrides.agents.worker).toEqual({});
    const saved = await service.execute({ type: "agent.save", id: "worker", value: { id: "worker",
      systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [],
    } });
    expect(saved.snapshot.agents.find(agent => agent.id === "worker")).toMatchObject({
      systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [],
    });
    const cleared = await service.execute({ type: "agent.save", id: "worker", value: { id: "worker", systemPrompt: " \n " } });
    expect(cleared.snapshot.overrides.agents.worker).toEqual({});
    expect(cleared.snapshot.agents.find(agent => agent.id === "worker")?.systemPrompt).toBe(initial.snapshot.defaults.agents.worker!.systemPrompt);
    expect(saved.snapshot.agents.find(agent => agent.id === "worker")?.systemPrompt).toBe("Custom instructions");
  });
  it("自定义配置始终继承原始基准；worker 被修改或删除不改变新代理", async () => {
    const { service } = setup();
    await service.execute({ type: "agent.save", id: "worker", value: { id: "worker", systemPrompt: "Changed worker", maxTurns: 1, enabled: false } });
    await service.execute({ type: "role.save", id: "default", value: { id: "default", thinking: "off", enabled: false } });
    const agent = await service.execute({ type: "agent.save", id: null, value: { id: "supervisor", tools: [] } });
    expect(agent.snapshot.agents.find(item => item.id === agent.savedId)).toMatchObject({
      id: "supervisor", tools: [], systemPrompt: configurationDefaults.agents.worker!.systemPrompt, maxTurns: configurationDefaults.agents.worker!.maxTurns, enabled: true,
    });
    const role = await service.execute({ type: "role.save", id: null, value: { id: "custom" } });
    expect(role.snapshot.roles.find(item => item.id === role.savedId)).toMatchObject({ id: "custom", thinking: configurationDefaults.roles.default!.thinking, enabled: true });
    await service.execute({ type: "remove", kind: "agent", id: "worker" });
    const after = await service.execute({ type: "agent.save", id: null, value: { id: "independent" } });
    expect(after.snapshot.agents.find(item => item.id === after.savedId)?.systemPrompt).toBe(configurationDefaults.agents.worker!.systemPrompt);
    await expect(service.execute({ type: "role.save", id: null, value: {} })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("工具策略覆盖替换内置策略；显式 null 与缺省分别表示调用方继承和内置值", async () => {
    const { service } = setup();
    const saved = await service.execute({ type: "agent.save", id: "explorer", value: { id: "explorer", excludeTools: ["bash"] } });
    expect(saved.snapshot.agents.find(item => item.id === "explorer")).toMatchObject({ tools: null, excludeTools: ["bash"] });
    const empty = await service.execute({ type: "agent.save", id: "explorer", value: { id: "explorer", tools: [] } });
    expect(empty.snapshot.agents.find(item => item.id === "explorer")).toMatchObject({ tools: [], excludeTools: null });
    await expect(service.execute({ type: "agent.save", id: "explorer", value: { id: "explorer", tools: [], excludeTools: [] } })).rejects.toMatchObject({ code: "invalid_request" });
    const inherited = await service.execute({ type: "role.save", id: "heavy", value: { id: "heavy", thinking: null, hidden: false } });
    expect(resolveModelRole(inherited.snapshot, "heavy", { model: null, thinking: "low" }).thinking).toBe("low");
    const reset = await service.execute({ type: "role.save", id: "heavy", value: { id: "heavy",} });
    expect(resolveModelRole(reset.snapshot, "heavy", { model: null, thinking: "low" }).thinking).toBe("high");
  });
  it("内置升级只改变未覆盖字段，已取得的生效配置保持稳定", () => {
    const oldDefaults = structuredClone(configurationDefaults);
    const nextDefaults = structuredClone(configurationDefaults);
    oldDefaults.agents.worker!.maxTurns = 1200;
    nextDefaults.agents.worker!.maxTurns = 3000;
    nextDefaults.agents.worker!.systemPrompt = "New built-in prompt";
    nextDefaults.roles.default!.thinking = "high";
    const agent = { id: "custom-agent", builtin: false, overrides: { systemPrompt: "Pinned prompt" } };
    const before = resolveAgentConfiguration(agent, oldDefaults);
    const after = resolveAgentConfiguration(agent, nextDefaults);
    expect(before.maxTurns).toBe(1200);
    expect(after).toMatchObject({ maxTurns: 3000, systemPrompt: "Pinned prompt" });
    const role = { id: "custom-role", builtin: false, overrides: { hidden: false } };
    expect(resolveRoleConfiguration(role, nextDefaults)).toMatchObject({ thinking: "high", hidden: false });
  });
  it("初始化五种模型角色和五种 agent；worker 默认可用，utility 可管理且隐藏", async () => {
    const { service } = setup();
    const { snapshot } = await service.execute({ type: "read" });
    expect(snapshot.providers).toEqual([]);
    expect(new Set(snapshot.roles.map(role => role.id))).toEqual(new Set(["default", "heavy", "fast", "utility", "smart"]));
    expect(snapshot.roles.find(role => role.id === "utility")).toMatchObject({ hidden: true, builtin: true, model: null });
    expect(snapshot.agents.map(agent => agent.id)).toEqual(["worker", "explorer", "reviewer", "researcher", "advisor"]);
    expect(snapshot.agents.find(agent => agent.id === "worker")).toMatchObject({ enabled: true, modelRole: "default" });
    expect(snapshot.agents.find(agent => agent.id === "advisor")).toMatchObject({ modelRole: "smart" });
  });
  it("配置独立于数据库重开；密钥只进入加密文件，不进入配置和界面响应", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    await service.execute({ type: "agent.save", id: "worker", value: { id: "worker", systemPrompt: "Pinned", enabled: false, tools: [] } });
    await service.execute({ type: "role.save", id: "heavy", value: { id: "heavy", thinking: null, hidden: false } });
    // 等级空集属于合法配置；保存与重开不因当前角色等级不可用而改写配置。
    const model = service.current().models[0]!;
    const modelValue = model;
    await service.execute({ type: "model.save", id: `${model.providerId}/${model.modelId}`,
      value: { ...modelValue, capabilities: { ...model.capabilities, reasoning: true, thinkingLevels: [] } } });
    expect(existsSync(join(root, "db"))).toBe(false);
    expect(readFileSync(join(root, "configuration.json"), "utf8")).not.toContain("test-key-not-for-network");
    const encrypted = readFileSync(join(root, "credentials", readdirSync(join(root, "credentials"))[0]!));
    expect(encrypted.toString()).not.toContain("test-key-not-for-network");
    service.close();
    const reopened = new ConfigurationService(root, protector);
    try {
      const result = await reopened.execute({ type: "read" });
      expect(result.snapshot.providers[0]).toMatchObject({ id: providerId, credentialState: "available" });
      expect(result.snapshot.models).toHaveLength(1);
      expect(result.snapshot.models[0]!.capabilities).toMatchObject({ reasoning: true, thinkingLevels: [] });
      expect(result.snapshot.overrides.agents.worker).toEqual({ systemPrompt: "Pinned", enabled: false, tools: [] });
      expect(result.snapshot.agents.find(agent => agent.id === "worker")).toMatchObject({ enabled: false, tools: [] });
      expect(result.snapshot.overrides.roles.heavy).toEqual({ thinking: null, hidden: false });
      expect(JSON.stringify(result)).not.toMatch(/test-key-not-for-network|credentialRef|ciphertext/);
    } finally { reopened.close(); }
  });
  it("删除提供商与其模型不刷新角色，旧快照不变，消费失效 ID 时明确失败", async () => {
    const { service } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const assigned = await service.execute({ type: "role.save", id: "heavy", value: { ...roleValue(snapshot, "heavy"), model: modelId } });
    const removed = await service.execute({ type: "remove", kind: "provider", id: providerId});
    expect(removed.snapshot.models).toEqual([]);
    expect(removed.snapshot.roles.find(role => role.id === "heavy")?.model).toBe(modelId);
    expect(assigned.snapshot.models).toHaveLength(1);
    expect(resolveModelRole(removed.snapshot, "heavy", { model: "another", thinking: "low" }).error).toBe("model_unavailable");
    await expect(service.execute({ type: "test.start", model: modelId })).rejects.toMatchObject({ code: "not_found" });
  });
  it("只有空值继承；显式 off 不继承，停用不等于隐藏", async () => {
    const { service } = setup();
    const { snapshot, modelId } = await addModel(service);
    const value = { ...roleValue(snapshot, "utility"), thinking: null };
    const saved = await service.execute({ type: "role.save", id: "utility", value });
    expect(resolveModelRole(saved.snapshot, "utility", { model: modelId, thinking: "high" }, { allowHidden: true })).toEqual({ model: modelId, thinking: "high", error: null });
    const off = await service.execute({ type: "role.save", id: "utility", value: { ...value, thinking: "off" } });
    expect(resolveModelRole(off.snapshot, "utility", { model: modelId, thinking: "high" }, { allowHidden: true }).thinking).toBe("off");
    const disabled = await service.execute({ type: "role.save", id: "utility", value: { ...value, enabled: false } });
    expect(resolveModelRole(disabled.snapshot, "utility", undefined, { allowHidden: true }).error).toBe("role_unavailable");
  });
  it("内置模型角色不可删除；自定义和 agent 可删，重开不重新播种", async () => {
    const { service, root, protector } = setup();
    await expect(service.execute({ type: "remove", kind: "role", id: "smart"})).rejects.toMatchObject({ code: "invalid_request" });
    const { snapshot } = await service.execute({ type: "read" });
    const custom = await service.execute({ type: "role.save", id: null, value: { ...roleValue(snapshot, "default"), id: "custom" } });
    await service.execute({ type: "remove", kind: "role", id: custom.savedId!});
    await service.execute({ type: "remove", kind: "agent", id: "advisor"});
    service.close();
    const reopened = new ConfigurationService(root, protector);
    try { expect((await reopened.execute({ type: "read" })).snapshot.agents.some(agent => agent.id === "advisor")).toBe(false); }
    finally { reopened.close(); }
  });
  it("凭据保护不可用时拒绝保存密钥，不落明文", async () => {
    const { service, root } = setup(undefined, false);
    await expect(addModel(service, "api_key")).rejects.toThrow();
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
    expect(JSON.stringify((await service.execute({ type: "read" })).snapshot)).not.toContain("test-key-not-for-network");
  });
  it("连接测试立即返回 ID，不占住配置读取；取消后迟到成功不覆盖结果", async () => {
    let resolveProbe!: () => void;
    const probe = vi.fn<ConnectionProbe>(async () => new Promise<void>(resolve => { resolveProbe = resolve; }));
    const { service } = setup(probe);
    const { modelId } = await addModel(service);
    const started = await service.execute({ type: "test.start", model: modelId });
    expect(started.snapshot.tests[0]?.state).toBe("running");
    expect((await service.execute({ type: "read" })).snapshot.models).toHaveLength(1);
    const cancelled = await service.execute({ type: "test.cancel", id: started.savedId! });
    expect(cancelled.snapshot.tests[0]?.state).toBe("cancelled");
    expect(probe.mock.calls[0]![0].signal.aborted).toBe(true);
    resolveProbe(); await Promise.resolve();
    expect((await service.execute({ type: "read" })).snapshot.tests[0]?.state).toBe("cancelled");
  });
  it("替换和删除凭据会清理旧密文；加密失败保留原配置", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    const first = readdirSync(join(root, "credentials"))[0]!;
    const save = { type: "provider.save" as const, id: providerId, value: { ...providerValue, auth: "api_key" as const },
      credential: { action: "replace" as const, value: "replacement-test-key" } };
    protector.encrypt.mockRejectedValueOnce(new Error("Sensitive system detail"));
    await expect(service.execute(save)).rejects.toThrow();
    expect(readdirSync(join(root, "credentials"))).toEqual([first]);
    await service.execute(save);
    const files = readdirSync(join(root, "credentials"));
    expect(files).toHaveLength(1);
    expect(files[0]).not.toBe(first);
    await service.execute({ type: "remove", kind: "provider", id: providerId});
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
  });
  it("无鉴权配置忽略替换密钥意图并移除旧凭据", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    protector.encrypt.mockClear();
    const result = await service.execute({ type: "provider.save", id: providerId, value: providerValue, credential: { action: "replace", value: "must-not-be-stored" } });
    expect(result.snapshot.providers[0]?.credentialState).toBe("not_required");
    expect(protector.encrypt).not.toHaveBeenCalled();
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
  });
  it("保存失败保留内存配置和旧凭据，清理新密文与临时文件", async () => {
    const { service, root } = setup();
    const { providerId } = await addModel(service, "api_key");
    const before = (await service.execute({ type: "read" })).snapshot;
    const credentials = readdirSync(join(root, "credentials"));
    const path = join(root, "configuration.json");
    const content = readFileSync(path, "utf8");
    // 同名目录使最终 rename 明确失败，无需依赖当前用户的文件权限。
    rmSync(path);
    mkdirSync(path);
    try {
      await expect(service.execute({ type: "provider.save", id: providerId,
        value: { ...providerValue, name: "Must not commit", auth: "api_key" },
        credential: { action: "replace", value: "replacement-test-key" } })).rejects.toThrow();
      expect((await service.execute({ type: "read" })).snapshot.providers).toEqual(before.providers);
      expect(readdirSync(join(root, "credentials"))).toEqual(credentials);
      expect(readdirSync(root).some(file => file.endsWith(".tmp"))).toBe(false);
    } finally {
      rmSync(path, { recursive: true });
      writeFileSync(path, content);
    }
    service.close();
    const reopened = new ConfigurationService(root, { available: async () => false, encrypt: async () => "", decrypt: async () => "" });
    try {
      expect((await reopened.execute({ type: "read" })).snapshot.providers[0]).toMatchObject({ id: providerId, name: "Local" });
    } finally { reopened.close(); }
  });
  it.each(["无效 JSON", "不支持的版本", "缺失配置类别", "身份重复"])("%s 不触发重置或覆盖原配置", scenario => {
    const { root, service, protector } = setup(); service.close();
    const file = join(root, "configuration.json"), document = JSON.parse(readFileSync(file, "utf8"));
    if (scenario === "不支持的版本") document.version = 999;
    else if (scenario === "缺失配置类别") delete document.agents;
    else if (scenario === "身份重复") document.roles.push(structuredClone(document.roles[0]));
    const content = scenario === "无效 JSON" ? "{broken" : JSON.stringify(document);
    writeFileSync(file, content);
    expect(() => new ConfigurationService(root, protector)).toThrow();
    expect(readFileSync(file, "utf8")).toBe(content);
  });
  it("关闭服务取消在途连接测试并拒绝后续命令", async () => {
    const probe = vi.fn<ConnectionProbe>(async ({ signal }) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
    const { service } = setup(probe);
    const { modelId } = await addModel(service);
    await service.execute({ type: "test.start", model: modelId });
    service.close();
    expect(probe.mock.calls[0]![0].signal.aborted).toBe(true);
    await expect(service.execute({ type: "read" })).rejects.toMatchObject({ code: "unavailable" });
  });

});
