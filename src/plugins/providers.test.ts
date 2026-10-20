import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginNamespace, type UsageItem } from "@atelier/sdk/contracts";
import { definePlugin, defineModule, UsageQueryError, type PluginContext, type PluginDefinition, type UsageQueryContext } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { providerPresetDraft } from "../shared/provider-presets.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function open(plugins: PluginDefinition[]) {
  const root = mkdtempSync(join(tmpdir(), "atelier-provider-usage-"));
  const service = new ApplicationService(root, { plugins, protector: {
    available: async () => true, encrypt: async value => Buffer.from(value).toString("base64"), decrypt: async value => Buffer.from(value, "base64").toString(),
  } });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= service.close();
  cleanups.push(async () => { await close(); rmSync(root, { recursive: true, force: true }); });
  return { service, close };
}
const items: UsageItem[] = [
  { type: "quota", id: "5h", label: "5h", scope: "plan", value: { type: "ratio", remaining: 0.5 }, window: { mode: "rolling", durationMs: 18000000, resetAt: null } },
  { type: "balance", id: "wallet", label: "Wallet", scope: "account", remaining: 3, currency: "USD" },
];
const value = { id: "my-glm", name: "My GLM", protocol: "openai-chat" as const, auth: "api_key" as const,
  baseUrl: "https://example.test/v1", enabled: true, compatibility: [], usage: "test-usage" };
const save = (service: ApplicationService, id: string | null = null, name = "My GLM") => service.configuration.execute({
  type: "provider.save", id, value: { ...value, name }, credential: { action: "replace", value: "private-test-key" },
});

describe("插件提供预设与账户用量", () => {
  // 预设和查询可被不同插件组合；只有选中的实现取得凭据，消费方只收到统一数据。
  it("内置目录由插件提供，外部插件可修改 usage 并新增预设，后台与前端查询共用缓存", async () => {
    let consumer!: PluginContext;
    const query = vi.fn(async (_: UsageQueryContext) => items);
    const { service } = open([
      definePlugin({ namespace: pluginNamespace("test.producer"), version: "1", dependencies: ["atelier.builtin"], setup: () => ({
        usageProviders: [{ id: "test-usage", label: "Test", query }],
        providerPresets: [
          { type: "patch", id: "zai-plan-cn", patch: { connection: { usage: "test-usage" } } },
          { type: "add", preset: { id: "custom-plan", name: "Custom plan", billing: "subscription", connection: {
            protocol: "openai-chat", baseUrl: "https://example.test/v1", auth: "api_key", compatibility: [], usage: "test-usage",
          }, sources: ["https://example.test/docs"], verifiedOn: "2026-10-20" } },
        ],
      }) }),
      definePlugin({ namespace: pluginNamespace("test.consumer"), version: "1", setup(context) { consumer = context; return {}; } }),
    ]);
    const snapshot = service.configuration.current();
    expect(snapshot.providerPresets?.find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("test-usage");
    expect(snapshot.providerPresets?.some(preset => preset.id === "custom-plan")).toBe(true);
    expect(consumer.providers.usageProviders().map(provider => provider.id)).toEqual(expect.arrayContaining(["zai-plan-cn", "test-usage"]));
    const preset = consumer.providers.presets().find(preset => preset.id === "zai-plan-cn")!;
    const draft = providerPresetDraft(preset);
    expect(draft.usage).toBe("test-usage");
    await save(service);
    const [runtime, desktop] = await Promise.all([
      consumer.providers.queryUsage(value.id), service.configuration.execute({ type: "usage.query", providerId: value.id }),
    ]);
    expect(runtime.items).toEqual(items);
    expect(desktop.usage).toEqual(runtime);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toMatchObject({ connection: { id: value.id, endpoint: value.baseUrl }, credential: "private-test-key" });
    expect(JSON.stringify(desktop)).not.toContain("private-test-key");
    expect(consumer.providers.presets().find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("test-usage");
  });

  // 注册后 setup 失败必须撤销同插件全部贡献；不能留下幽灵提供方或预设覆盖。
  it("失败插件的新增和覆盖全部撤回，重复查询 ID 不能替换已有实现", () => {
    const { service } = open([definePlugin({ namespace: pluginNamespace("test.failed"), version: "1", dependencies: ["atelier.builtin"],
      setup: () => ({ usageProviders: [{ id: "temporary", label: "Temporary", query: async () => [] }],
        providerPresets: [{ type: "patch", id: "zai-plan-cn", patch: { connection: { usage: "temporary" } } }] }),
      modules: [defineModule(() => { throw new Error("setup failed"); })],
    }), definePlugin({ namespace: pluginNamespace("test.duplicate"), version: "1", setup: () => ({
      usageProviders: [{ id: "zai-plan-cn", label: "Duplicate", query: async () => [] }],
    }) })]);
    expect(service.sessions.plugins.filter(plugin => plugin.id.startsWith("test.")).map(plugin => plugin.status)).toEqual(["failed", "failed"]);
    expect(service.configuration.current().providerPresets?.find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("zai-plan-cn");
    expect(service.configuration.current().usageProviders?.map(provider => provider.id)).not.toContain("temporary");
    expect(service.configuration.current().usageProviders?.filter(provider => provider.id === "zai-plan-cn")).toHaveLength(1);
  });

  // 同一连接更新凭据/修订后，旧查询即使返回成功也不能覆盖新账户；失败保留上次实报。
  it("旧修订结果失效，失败保留已知结果，提供方缺席明确不可用", async () => {
    let finish!: (items: UsageItem[]) => void;
    const query = vi.fn(async (_: UsageQueryContext) => items);
    const { service } = open([definePlugin({ namespace: pluginNamespace("test.provider"), version: "1", setup: () => ({
      usageProviders: [{ id: "test-usage", label: "Test", query }],
    }) })]);
    await save(service);
    query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = service.configuration.usage.query(value.id);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    await save(service, value.id, "Changed");
    finish(items);
    expect((await pending).items).toEqual([]);
    const current = await service.configuration.usage.query(value.id);
    expect(current).toMatchObject({ state: "ready", items });
    query.mockRejectedValueOnce(new UsageQueryError("authentication"));
    expect(await service.configuration.usage.query(value.id, { refresh: true })).toMatchObject({ state: "error", error: "authentication", items, updatedAt: current.updatedAt });
    service.configuration.extensions.removeOwners(["test.provider"]);
    expect(await service.configuration.usage.query(value.id)).toMatchObject({ state: "error", error: "unavailable", items: [] });
  });

  // 查询与插件调用同样参与真实收束；取消信号不能提前释放提供方的 closing 资源。
  it("关闭先取消查询并等待提供方退出，再清理插件", async () => {
    let release!: () => void, started!: () => void;
    let signal!: AbortSignal;
    const began = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const order: string[] = [];
    const { service, close } = open([definePlugin({ namespace: pluginNamespace("test.wait"), version: "1", setup: () => ({
      usageProviders: [{ id: "test-usage", label: "Wait", async query(context) { signal = context.signal; started(); await held; order.push("query"); return items; } }],
      async closing() { order.push("closing"); },
    }) })]);
    await save(service);
    const pending = service.configuration.usage.query(value.id);
    await began;
    const closing = close();
    expect(signal.aborted).toBe(true);
    expect(order).toEqual([]);
    release();
    await pending; await closing;
    expect(order).toEqual(["query", "closing"]);
  });
});
