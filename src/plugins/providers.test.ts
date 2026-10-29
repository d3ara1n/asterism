import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginNamespace, type UsageItem, type ModelEvent } from "@asterism-app/sdk/contracts";
import { definePlugin, defineModule, type PluginContext, type PluginDefinition, type UsageQueryContext } from "@asterism-app/sdk/runtime";
import { BuiltinApplicationService as ApplicationService } from "../../packages/builtin/src/testing.ts";
import { modelProviderPresetDraft } from "../shared/provider-presets.ts";
import { createModelInput } from "../shared/configuration.ts";
import { createModelServices } from "./models.ts";
import { ReadUsage } from "@asterism-app/sdk/contracts";
import { ProviderUsageService } from "../configuration/usage.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllGlobals(); });
function open(plugins: PluginDefinition[], pluginDependencies?: ReadonlyMap<string, readonly string[]>) {
  const root = mkdtempSync(join(tmpdir(), "asterism-provider-usage-"));
  let observer!: PluginContext;
  const service = new ApplicationService(root, { pluginDependencies, plugins: [...plugins,
    definePlugin({ namespace: pluginNamespace("test.observer"), setup(context) { observer = context; return {}; } })], protector: {
    available: async () => true, encrypt: async value => Buffer.from(value).toString("base64"), decrypt: async value => Buffer.from(value, "base64").toString(),
  } });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= service.close();
  cleanups.push(async () => { await close(); rmSync(root, { recursive: true, force: true }); });
  return { service, close, observer };
}
const items: UsageItem[] = [
  { type: "quota", id: "5h", label: "5h", scope: "plan", value: { type: "ratio", remaining: 0.5 }, window: { mode: "rolling", durationMs: 18000000, resetAt: null } },
  { type: "balance", id: "wallet", label: "Wallet", scope: "account", remaining: 3, currency: "USD" },
];
const value = { id: "my-glm", name: "My GLM", protocol: "openai-chat" as const, auth: "api_key" as const,
  baseUrl: "https://example.test/v1", enabled: true, compatibility: [], usage: "test-usage" };
const save = (service: ApplicationService, id: string | null = null, name = "My GLM") => service.configuration.execute({
  type: "modelProvider.save", id, value: { ...value, name }, credential: { action: "replace", value: "private-test-key" },
});
const read = (plugin: PluginContext, refresh = false) => plugin.ipc.calls.invoke(ReadUsage, { providerId: value.id, refresh }, {});

describe("Plugin presets and account usage", () => {
  // Models deliver only public response metadata; calling plugins explicitly choose consumption, independently of text and token usage.
  it("calling plugins obtain and explicitly consume response headers while model services do not update other consumers automatically", async () => {
    const { service, observer } = open([]);
    await service.configuration.execute({ type: "modelProvider.save", id: null, value: { ...value, auth: "none", usage: "openai" }, credential: { action: "keep" } });
    const model = createModelInput(value.id, { name: "Test", modelId: "test" });
    model.capabilities.reasoning = false; model.capabilities.tools = false;
    await service.configuration.execute({ type: "model.save", id: null, value: model });
    const frames = [
      { id: "response", object: "chat.completion.chunk", model: "test", created: 0,
        choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] },
      { id: "response", object: "chat.completion.chunk", model: "test", created: 0,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ];
    const transport = vi.fn<typeof fetch>(async () => new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""), {
      headers: { "content-type": "text/event-stream", "x-ratelimit-limit-tokens": "100", "x-ratelimit-remaining-tokens": "40" },
    }));
    vi.stubGlobal("fetch", transport);
    const usage = new ProviderUsageService(observer.modelProviders, observer.usageProviders);
    cleanups.push(async () => usage.close());
    const events: ModelEvent[] = [];
    for await (const event of createModelServices(service.configuration).stream({
      target: { provider: value.id, model: "test" }, system: { blocks: [] },
      messages: [{ kind: "input", parts: [{ kind: "text", text: "Hello" }] }], signal: new AbortController().signal,
    })) {
      events.push(event);
      if (event.type === "finish" && event.response) usage.consume(event.response);
    }
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "part.delta", delta: "OK" })]));
    expect(events.find(event => event.type === "finish")).toMatchObject({ usage: { input: 1, output: 1, total: 2 } });
    expect(await usage.query(value.id, { refresh: true })).toMatchObject({
      source: "headers", state: "ready", model: "test", items: [{ category: "rate_limit", value: { limit: 100, remaining: 40 } }],
    });
    expect(await read(observer)).toMatchObject({ state: "waiting", items: [] });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  // Different plugins compose presets and queries; consumers explicitly obtain credentials and choose implementations while the catalog itself does not cache.
  it("plugins register and modify catalogs; consumers independently choose queries while the built-in toolbar uses its own cache", async () => {
    let consumer!: PluginContext;
    const query = vi.fn(async (_: UsageQueryContext) => items);
    const { service } = open([
      definePlugin({ namespace: pluginNamespace("test.producer"), setup: () => ({
        usageProviders: [{ id: "test-usage", label: "Test", query }],
        modelProviderPresets: [
          { type: "patch", id: "zai-plan-cn", patch: { connection: { usage: "test-usage" } } },
          { type: "add", preset: { id: "custom-plan", name: "Custom plan", billing: "subscription", connection: {
            protocol: "openai-chat", baseUrl: "https://example.test/v1", auth: "api_key", compatibility: [], usage: "test-usage",
          }, sources: ["https://example.test/docs"], verifiedOn: "2026-10-20" } },
        ],
      }) }),
      definePlugin({ namespace: pluginNamespace("test.consumer"), setup(context) { consumer = context; return {}; } }),
    ], new Map([["test.producer", ["asterism.builtin"]]]));
    const snapshot = service.configuration.current();
    expect(snapshot.modelProviderPresets?.find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("test-usage");
    expect(snapshot.modelProviderPresets?.some(preset => preset.id === "custom-plan")).toBe(true);
    expect(consumer.usageProviders.list().map(provider => provider.id)).toEqual(expect.arrayContaining(["zai-plan-cn", "test-usage"]));
    const preset = consumer.modelProviders.presets().find(preset => preset.id === "zai-plan-cn")!;
    const draft = modelProviderPresetDraft(preset);
    expect(draft.usage).toBe("test-usage");
    await save(service);
    const connection = consumer.modelProviders.get(value.id)!;
    expect(consumer.modelProviders.list()).toContainEqual(connection);
    const provider = consumer.usageProviders.get(connection.usage!)!;
    if (provider.source === "headers") throw new Error("Expected query provider");
    const credential = await consumer.modelProviders.credential(connection.id);
    expect(await provider.query({ connection: { id: connection.id, endpoint: connection.baseUrl }, credential, signal: new AbortController().signal })).toEqual(items);
    const [runtime, desktop] = await Promise.all([read(consumer), read(consumer)]);
    expect(runtime.items).toEqual(items);
    expect(desktop).toEqual(runtime);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toMatchObject({ connection: { id: value.id, endpoint: value.baseUrl }, credential: "private-test-key" });
    expect(JSON.stringify(desktop)).not.toContain("private-test-key");
    expect(consumer.modelProviders.presets().find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("test-usage");
  });

  // setup failure after registration must revoke all contributions from that plugin without leaving ghost providers or preset overrides.
  it("failed plugins retract all additions and overrides and duplicate query IDs cannot replace existing implementations", () => {
    const { service } = open([definePlugin({ namespace: pluginNamespace("test.failed"),
      setup: () => ({ usageProviders: [{ id: "temporary", label: "Temporary", query: async () => [] }],
        modelProviderPresets: [{ type: "patch", id: "zai-plan-cn", patch: { connection: { usage: "temporary" } } }] }),
      modules: [defineModule(() => { throw new Error("setup failed"); })],
    }), definePlugin({ namespace: pluginNamespace("test.duplicate"), setup: () => ({
      usageProviders: [{ id: "zai-plan-cn", label: "Duplicate", query: async () => [] }],
    }) })], new Map([["test.failed", ["asterism.builtin"]]]));
    expect(service.sessions.plugins.filter(plugin => ["test.failed", "test.duplicate"].includes(plugin.id)).map(plugin => plugin.status)).toEqual(["failed", "failed"]);
    expect(service.configuration.current().modelProviderPresets?.find(preset => preset.id === "zai-plan-cn")?.connection.usage).toBe("zai-plan-cn");
    expect(service.configuration.current().usageProviders?.map(provider => provider.id)).not.toContain("temporary");
    expect(service.configuration.current().usageProviders?.filter(provider => provider.id === "zai-plan-cn")).toHaveLength(1);
  });

  // Queries finalize like plugin calls; cancellation signals must not release providers' closing resources early.
  it("close first cancels queries and waits for provider exit before cleaning up plugins", async () => {
    let release!: () => void, started!: () => void;
    let signal!: AbortSignal;
    const began = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const order: string[] = [];
    const { service, close, observer } = open([definePlugin({ namespace: pluginNamespace("test.wait"), setup: plugin => {
      plugin.lifetime.defer(() => { order.push("closing"); });
      return { usageProviders: [{ id: "test-usage", label: "Wait", async query(context) { signal = context.signal; started(); await held; order.push("query"); return items; } }] };
    } })]);
    await save(service);
    const provider = observer.usageProviders.get("test-usage")!;
    if (provider.source === "headers") throw new Error("Expected query provider");
    const pending = provider.query({ connection: { id: value.id, endpoint: value.baseUrl }, credential: null, signal: new AbortController().signal });
    const settled = pending.catch(() => {});
    await began;
    const closing = close();
    expect(signal.aborted).toBe(true);
    expect(order).toEqual([]);
    release();
    await settled; await closing;
    expect(order).toEqual(["query", "closing"]);
  });
});
