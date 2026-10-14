import { thinkingLevels } from "@atelier/sdk/contracts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveModelRole, type ConfigurationSnapshot } from "../shared/configuration.ts";
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
    providerId: provider.savedId!, name: "Test model", modelId: "test-model", enabled: true, contextWindow: 32000, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { providerId: provider.savedId!, modelId: model.savedId!, snapshot: model.snapshot };
}
function roleValue(snapshot: ConfigurationSnapshot, id: string) {
  const { id: _id, revision: _revision, builtin: _builtin, ...value } = snapshot.roles.find(role => role.id === id)!;
  return value;
}

describe("真实配置与消费边界", () => {
  // 参数获取在队列外等待，成功才原子保存；网络失败和期间改动不得污染已保存配置。
  it("目录参数覆盖旧值并持久化，获取失败保留原值且返回明确提示", async () => {
    const data: Catalog = { providers: {}, models: { "lab/test-model": {
      id: "lab/test-model", name: "Test", description: "", reasoning: true, tool_call: false,
      limit: { context: 128000, output: 16000 },
    } } };
    const catalog = vi.fn<LoadModelCatalog>(async () => data);
    const { service, root, protector } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId } = await addModel(service);
    const updated = await service.execute({ type: "model.parameters", model: modelId });
    expect(updated.snapshot.models[0]).toMatchObject({
      contextWindow: 128000, capabilities: { reasoning: true, tools: false }, generation: { maxOutputTokens: 16000 },
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

  it("目录网络等待不阻塞配置队列，期间模型修改与退出阻止迟到覆盖", async () => {
    let finish!: (catalog: Catalog) => void;
    let signal!: AbortSignal;
    const catalog: LoadModelCatalog = input => { signal = input; return new Promise(resolve => { finish = resolve; }); };
    const { service } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId } = await addModel(service);
    const request = service.execute({ type: "model.parameters", model: modelId });
    const rejected = expect(request).rejects.toMatchObject({ code: "conflict", display: { id: "modelCatalog.changed" } });
    const snapshot = (await service.execute({ type: "read" })).snapshot;
    const { revision: _revision, ...value } = snapshot.models[0]!;
    await service.execute({ type: "model.save", id: modelId, value: { ...value, contextWindow: 777 } });
    finish({ providers: {}, models: {} });
    await rejected;
    expect(service.current().models[0]?.contextWindow).toBe(777);
    const second = service.execute({ type: "model.parameters", model: modelId });
    const closed = expect(second).rejects.toMatchObject({ code: "unavailable" });
    await service.execute({ type: "read" });
    service.close();
    expect(signal.aborted).toBe(true);
    finish({ providers: {}, models: {} });
    await closed;
  });
  // 删除后重建会重新从 revision=1 开始，仅比较修订号会把旧请求写入新记录。
  it("删除再以相同 ID 与修订号重建模型，旧参数请求仍失效", async () => {
    let finish!: (catalog: Catalog) => void;
    const catalog: LoadModelCatalog = () => new Promise(resolve => { finish = resolve; });
    const { service } = setup(undefined, true, 30_000, undefined, catalog);
    const { modelId, snapshot } = await addModel(service);
    const { revision: _revision, ...value } = snapshot.models[0]!;
    const request = service.execute({ type: "model.parameters", model: modelId });
    const rejected = expect(request).rejects.toMatchObject({ code: "conflict", display: { id: "modelCatalog.changed" } });
    await service.execute({ type: "remove", kind: "model", id: modelId });
    await service.execute({ type: "model.save", id: null, value });
    finish({ providers: {}, models: {} });
    await rejected;
    expect(service.current().models).toEqual(snapshot.models);
  });
  // 发现不写配置；批量添加只接受本次目录中的 ID，已有记录与用户覆盖永不被刷新替换。
  it("发现后批量添加、去重和重开保留配置；连接变化使旧列表失效", async () => {
    const discover = vi.fn<DiscoverModels>(async () => [
      { modelId: "test-model", name: "Upstream changed name" },
      { modelId: "new-model", name: "New", contextWindow: 64000, reasoning: true, thinkingLevels: ["low", "high"] },
    ]);
    const { service, root, protector } = setup(undefined, true, 30_000, discover);
    const { snapshot } = await addModel(service, "api_key");
    const original = snapshot.models[0];
    const started = await service.execute({ type: "discovery.start", providerId: "local" });
    await vi.waitFor(() => expect(service.current().discoveries[0]?.state).toBe("succeeded"));
    expect(discover.mock.calls[0]?.[0].apiKey).toBe("test-key-not-for-network");
    expect(service.current().models).toEqual([original]);
    const id = started.savedId!;
    await expect(service.execute({ type: "discovery.add", id, modelIds: ["new-model", "absent"] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.current().models).toEqual([original]);
    const added = await service.execute({ type: "discovery.add", id, modelIds: ["test-model", "new-model", "new-model"] });
    expect(added.snapshot.models).toHaveLength(2);
    expect(added.snapshot.models[0]).toEqual(original);
    expect(added.snapshot.models[1]).toMatchObject({
      modelId: "new-model", contextWindow: 64000, capabilities: { reasoning: true, thinkingLevels: ["low", "high"] },
      generation: { maxOutputTokens: null }, compatibility: [],
    });
    await service.execute({ type: "discovery.add", id, modelIds: ["new-model"] });
    expect(service.current().models).toEqual(added.snapshot.models);
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().models).toEqual(added.snapshot.models);
    expect(reopened.current().discoveries).toEqual([]);
    await service.execute({ type: "provider.save", id: "local", value: providerValue, credential: { action: "keep" } });
    await expect(service.execute({ type: "discovery.add", id, modelIds: ["new-model"] })).rejects.toMatchObject({ code: "not_found" });
  });

  // 网络等待不能占用配置队列；取消、超时和刷新后的迟到成功不能复活旧结果。
  it("发现等待不阻塞配置读取；取消、刷新、超时与关闭均终止在途请求", async () => {
    vi.useFakeTimers();
    const pending: { resolve: (models: []) => void; signal: AbortSignal }[] = [];
    const discover: DiscoverModels = ({ signal }) => new Promise(resolve => pending.push({ resolve, signal }));
    const { service, changed } = setup(undefined, true, 100, discover);
    await service.execute({ type: "provider.save", id: null, value: providerValue, credential: { action: "keep" } });
    const first = await service.execute({ type: "discovery.start", providerId: "local" });
    expect((await service.execute({ type: "read" })).snapshot.discoveries[0]?.state).toBe("running");
    await service.execute({ type: "discovery.cancel", id: first.savedId! });
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.resolve([]);
    await Promise.resolve();
    expect(service.current().discoveries[0]?.state).toBe("cancelled");
    await service.execute({ type: "discovery.start", providerId: "local" });
    await service.execute({ type: "discovery.start", providerId: "local" });
    expect(pending[1]!.signal.aborted).toBe(true);
    pending[1]!.resolve([]);
    await vi.advanceTimersByTimeAsync(101);
    expect(service.current().discoveries).toHaveLength(1);
    expect(service.current().discoveries[0]).toMatchObject({ state: "failed", error: "timeout", models: [] });
    expect(pending[2]!.signal.aborted).toBe(true);
    pending[2]!.resolve([]);
    await Promise.resolve();
    expect(service.current().discoveries[0]?.state).toBe("failed");
    await service.execute({ type: "discovery.start", providerId: "local" });
    const notifications = changed.mock.calls.length;
    service.close();
    expect(pending[3]!.signal.aborted).toBe(true);
    pending[3]!.resolve([]);
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(notifications);
  });
  // 两层独立保存显式条目；参考协议不拦截保存，非法候选不能污染已保存数据。
  it.each(["provider", "model"] as const)("%s 兼容条目独立保存并重开，非法条目拒绝且移除后不重现", async kind => {
    const { service, root, protector } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const { revision: _revision, ...value } = snapshot.models[0]!;
    const save = (target: ConfigurationService, compatibility: ModelCompatibility[]) => kind === "provider"
      ? target.execute({ type: "provider.save", id: providerId, value: { ...providerValue, compatibility }, credential: { action: "keep" } })
      : target.execute({ type: "model.save", id: modelId, value: { ...value, compatibility } });
    const compatibility = [{ id: "thinkingInDeepSeekFormat" }, { id: "systemMessageInMessages" }];
    await save(service, compatibility);
    for (const invalid of [
      [compatibility[0]!, compatibility[0]!],
      [{ id: "unknownCompatibility" }],
      [{ id: "thinkingInDeepSeekFormat", value: false }],
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
    const saved = await service.execute({ type: "agent.save", id: "worker", value: {
      systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [],
    } });
    expect(saved.snapshot.agents.find(agent => agent.id === "worker")).toMatchObject({
      systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [],
    });
    const cleared = await service.execute({ type: "agent.save", id: "worker", value: { systemPrompt: " \n " } });
    expect(cleared.snapshot.overrides.agents.worker).toEqual({});
    expect(cleared.snapshot.agents.find(agent => agent.id === "worker")?.systemPrompt).toBe(initial.snapshot.defaults.agents.worker!.systemPrompt);
    expect(saved.snapshot.agents.find(agent => agent.id === "worker")?.systemPrompt).toBe("Custom instructions");
  });
  it("自定义配置始终继承原始基准；worker 被修改或删除不改变新代理", async () => {
    const { service } = setup();
    await service.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Changed worker", timeout: 1, enabled: false } });
    await service.execute({ type: "role.save", id: "default", value: { thinking: "off", enabled: false } });
    const agent = await service.execute({ type: "agent.save", id: null, value: { name: "Supervisor", tools: [] } });
    expect(agent.snapshot.agents.find(item => item.id === agent.savedId)).toMatchObject({
      name: "Supervisor", tools: [], systemPrompt: configurationDefaults.agents.worker!.systemPrompt, timeout: configurationDefaults.agents.worker!.timeout, enabled: true,
    });
    const role = await service.execute({ type: "role.save", id: null, value: { name: "Custom" } });
    expect(role.snapshot.roles.find(item => item.id === role.savedId)).toMatchObject({ name: "Custom", thinking: configurationDefaults.roles.default!.thinking, enabled: true });
    await service.execute({ type: "remove", kind: "agent", id: "worker" });
    const after = await service.execute({ type: "agent.save", id: null, value: { name: "Independent" } });
    expect(after.snapshot.agents.find(item => item.id === after.savedId)?.systemPrompt).toBe(configurationDefaults.agents.worker!.systemPrompt);
    await expect(service.execute({ type: "role.save", id: null, value: {} })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("工具策略覆盖替换内置策略；显式 null 与缺省分别表示调用方继承和内置值", async () => {
    const { service } = setup();
    const saved = await service.execute({ type: "agent.save", id: "explorer", value: { excludeTools: ["bash"] } });
    expect(saved.snapshot.agents.find(item => item.id === "explorer")).toMatchObject({ tools: null, excludeTools: ["bash"] });
    const empty = await service.execute({ type: "agent.save", id: "explorer", value: { tools: [] } });
    expect(empty.snapshot.agents.find(item => item.id === "explorer")).toMatchObject({ tools: [], excludeTools: null });
    await expect(service.execute({ type: "agent.save", id: "explorer", value: { tools: [], excludeTools: [] } })).rejects.toMatchObject({ code: "invalid_request" });
    const inherited = await service.execute({ type: "role.save", id: "heavy", value: { thinking: null, hidden: false } });
    expect(resolveModelRole(inherited.snapshot, "heavy", { model: null, thinking: "low" }).thinking).toBe("low");
    const reset = await service.execute({ type: "role.save", id: "heavy", value: {} });
    expect(resolveModelRole(reset.snapshot, "heavy", { model: null, thinking: "low" }).thinking).toBe("high");
  });
  it("内置升级只改变未覆盖字段，已取得的生效配置保持稳定", () => {
    const oldDefaults = structuredClone(configurationDefaults);
    const nextDefaults = structuredClone(configurationDefaults);
    oldDefaults.agents.worker!.timeout = 1200;
    nextDefaults.agents.worker!.timeout = 3000;
    nextDefaults.agents.worker!.systemPrompt = "New built-in prompt";
    nextDefaults.roles.default!.thinking = "high";
    const agent = { id: "custom-agent", revision: 1, builtin: false, overrides: { name: "Custom", systemPrompt: "Pinned prompt" } };
    const before = resolveAgentConfiguration(agent, oldDefaults);
    const after = resolveAgentConfiguration(agent, nextDefaults);
    expect(before.timeout).toBe(1200);
    expect(after).toMatchObject({ timeout: 3000, systemPrompt: "Pinned prompt" });
    const role = { id: "custom-role", revision: 1, builtin: false, overrides: { name: "Custom", hidden: false } };
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
    await service.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Pinned", enabled: false, tools: [] } });
    await service.execute({ type: "role.save", id: "heavy", value: { thinking: null, hidden: false } });
    // 等级空集属于合法配置；保存与重开不因当前角色等级不可用而改写配置。
    const model = service.current().models[0]!;
    const { revision: _revision, ...modelValue } = model;
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
    const custom = await service.execute({ type: "role.save", id: null, value: { ...roleValue(snapshot, "default"), name: "Custom" } });
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
  it("超时主动取消网络请求，结果带测试时配置修订", async () => {
    vi.useFakeTimers();
    const probe = vi.fn<ConnectionProbe>(async ({ signal }) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
    const { service } = setup(probe, true, 50);
    const { modelId } = await addModel(service);
    const started = await service.execute({ type: "test.start", model: modelId });
    await vi.advanceTimersByTimeAsync(50);
    const read = await service.execute({ type: "read" });
    expect(read.snapshot.tests[0]).toMatchObject({ id: started.savedId, state: "failed", error: "timeout", modelRevision: 1, providerRevision: 1 });
    expect(probe.mock.calls[0]![0].signal.aborted).toBe(true);
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
      expect((await reopened.execute({ type: "read" })).snapshot.providers[0]).toMatchObject({ id: providerId, name: "Local", revision: 1 });
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
