import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelInput, type ModelProvider, type ModelProviderInput } from "../shared/configuration.ts";
import { modelProviderPresetDraft } from "../shared/provider-presets.ts";
import { modelProviderPresets } from "../../packages/builtin/src/providers/presets.ts";
import { ConfigurationService } from "./service.ts";
import { configurationStorage } from "./store.ts";
import type { ConnectionProbe } from "./probe.ts";
import type { ModelCompatibility } from "../shared/model-compatibility.ts";
import type { DiscoverModels } from "./discovery.ts";
import type { LoadModelCatalog } from "./model-catalog.ts";
import type { Catalog } from "@opencode-ai/models";
import { z } from "zod";
import { RunLifecycle } from "../plugins/lifecycle.ts";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.useRealTimers(); });
function setup(probe: ConnectionProbe = async () => {}, timeout = 30_000, discover?: DiscoverModels, catalog?: LoadModelCatalog) {
  const root = mkdtempSync(join(tmpdir(), "core-configuration-"));
  const changed = vi.fn();
  const service = new ConfigurationService(root, changed, probe, timeout, discover, catalog);
  cleanups.push(() => { service.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, service, changed };
}
const providerValue = { id: "local", name: "Local", protocol: "openai-chat" as const, baseUrl: "http://127.0.0.1:1234/v1", enabled: true, auth: "none" as "none" | "api_key", compatibility: [], apiKey: "" };
async function addModel(service: ConfigurationService, auth: "none" | "api_key" = "none") {
  const provider = await service.execute({ type: "modelProvider.save", id: null, value: { ...providerValue, auth,
    apiKey: auth === "none" ? "" : "test-key-not-for-network" } });
  const model = await service.execute({ type: "model.save", id: null, value: {
    providerId: provider.savedId!, name: "Test model", modelId: "test-model", enabled: true, contextWindow: 32000, cost: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { providerId: provider.savedId!, modelId: model.savedId!, snapshot: model.snapshot };
}

describe("Real configuration and consumption boundaries", () => {
  // The prior saved format has no lifecycle settings; migration must preserve its credentials and entry, and later reads must not reseed edited preferences.
  it("upgrades v14 configuration without losing saved settings and preserves lifecycle edits across reopening", async () => {
    const { root, service } = setup();
    service.close();
    const fixture = readFileSync(join(import.meta.dirname, "fixtures", "configuration-v14.json"), "utf8");
    writeFileSync(join(root, "configuration.json"), fixture);
    await configurationStorage(root).inspect()!.apply();
    const migrated = new ConfigurationService(root);
    cleanups.push(() => migrated.close());
    expect(migrated.sessionLifecycle()).toEqual({ retentionDays: 30, sleepDays: 30 });
    const saved = await migrated.execute({ type: "sessionLifecycle.set", value: { retentionDays: null, sleepDays: 7 } });
    expect(saved.snapshot.sessionLifecycle).toEqual({ retentionDays: null, sleepDays: 7 });
    migrated.close();
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.sessionLifecycle()).toEqual({ retentionDays: null, sleepDays: 7 });
    expect(reopened.current().sessionEntry).toEqual({ pluginId: "test.plugin", entryId: "home" });
    expect(reopened.current().modelProviders[0]?.apiKey).toBe("example-saved-key");
    expect(reopened.mcpAuthorization("example")).toEqual({ port: 62986 });
    expect(configurationStorage(root).inspect()).toBeNull();
  });
  it("keeps independently named messaging connections and multiple credentials separate", async () => {
    const { service, root } = setup(), life = new RunLifecycle(() => {});
    cleanups.push(() => life.stop());
    service.messaging.declare("test.messaging", [{
      id: "messenger", label: "Messenger", settings: [
        { kind: "text", key: "account", label: "Account", required: true },
        { kind: "secret", key: "token", label: "Token", required: true },
        { kind: "secret", key: "optional", label: "Optional", required: false },
      ],
      async create() { throw new Error("Disabled connections must not initialize."); },
    }], life.group("call"));
    const save = (id: string | null, name: string, settings: Record<string, string>) => service.execute({ type: "messaging.save", id,
      value: { name, providerId: "messenger", enabled: false, settings } });
    const first = await save(null, "Support", { account: "support", token: "support-secret", optional: "secondary-secret" });
    const second = await save(null, "Team", { account: "team", token: "team-secret" });
    expect(first.savedId).not.toBe(second.savedId);
    expect(second.snapshot.messagingConnections.map(connection => connection.name)).toEqual(["Support", "Team"]);
    await expect(save(first.savedId, "Support", { account: "support", token: " " })).rejects.toMatchObject({ code: "invalid_request" });
    const updated = await save(first.savedId, "Support", { account: "support", token: "support-secret", optional: "" });
    expect(updated.snapshot.messagingConnections.map(connection => connection.settings)).toEqual([
      { account: "support", token: "support-secret" }, { account: "team", token: "team-secret" },
    ]);
    await service.execute({ type: "remove", kind: "messaging", id: first.savedId });
    expect(service.current().messagingConnections.map(connection => connection.id)).toEqual([second.savedId]);
  });
  it("persists web provider order without changing credentials or enablement", async () => {
    const { service, root } = setup();
    const life = new RunLifecycle(() => {});
    cleanups.push(() => life.stop());
    const create = vi.fn(() => ({ fetch: async () => ({ documents: [], hints: [] }) }));
    const definition = { id: "test-web", label: "Test web", search: false, fetch: true, urlPatterns: ["*"],
      settings: [{ kind: "secret" as const, key: "apiKey", label: "API key", required: true }], create };
    const other = { id: "other", label: "Other", search: true, fetch: false, urlPatterns: [], settings: [], create };
    service.web.declare("test.web", [definition, other], life.group("call"));
    await service.execute({ type: "webProvider.save", id: definition.id, enabled: true, settings: { apiKey: "web-key" } });
    await service.execute({ type: "webProvider.save", id: "other", enabled: false, settings: {} });
    await service.execute({ type: "webProvider.reorder", ids: ["other", definition.id] });
    for (const ids of [[definition.id], ["other", "other"], ["other", "unknown"]]) {
      await expect(service.execute({ type: "webProvider.reorder", ids })).rejects.toMatchObject({ code: "invalid_request" });
    }
    service.close();
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    reopened.web.declare("test.web", [definition, other], life.group("call"));
    expect(reopened.current().webProviders.map(item => [item.id, item.enabled])).toEqual([["other", false], [definition.id, true]]);
    await reopened.web.resolve(definition.id, { signal: new AbortController().signal });
    expect(create).toHaveBeenCalledWith({ settings: { apiKey: "web-key" } });
    // Updating a reordered provider preserves its position.
    await reopened.execute({ type: "webProvider.save", id: definition.id, enabled: false, settings: { apiKey: "new-key" } });
    expect(reopened.current().webProviders[1]).toEqual({ id: definition.id, enabled: false, settings: { apiKey: "new-key" } });
  });
  // v12 stored one encrypted API key reference per web provider; losing it on upgrade would silently disable configured services.
  it("migrates v12 web provider credentials into the apiKey setting", async () => {
    const { root } = setup();
    const ref = "44444444-4444-4444-8444-444444444444";
    mkdirSync(join(root, "credentials"));
    writeFileSync(join(root, "credentials", `${ref}.enc`), "legacy-encrypted-key");
    writeFileSync(join(root, "configuration.json"), JSON.stringify({ version: 12, mcp: { servers: [] }, mcpCredentialRefs: {},
      shell: { selected: "auto", profiles: [] }, modelProviders: [], models: [], sessionEntry: null,
      webProviders: [{ id: "keyed", enabled: true, credentialRef: ref }, { id: "keyless", enabled: false, credentialRef: null }] }));
    const decrypt = vi.fn(async () => "legacy-key");
    await configurationStorage(root, decrypt).inspect()!.apply();
    expect(decrypt).toHaveBeenCalledWith(Buffer.from("legacy-encrypted-key").toString("base64"));
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.current().webProviders).toEqual([
      { id: "keyed", enabled: true, settings: { apiKey: "legacy-key" } },
      { id: "keyless", enabled: false, settings: {} },
    ]);
  });
  // Saved values must stay within the current declaration; settings the type stops declaring are removed with the next save.
  it("validates web provider settings against the declared type and drops undeclared values", async () => {
    const { service, root } = setup();
    const life = new RunLifecycle(() => {});
    cleanups.push(() => life.stop());
    const create = () => ({ search: async () => ({ documents: [], hints: [] }) });
    const choice = { kind: "choice" as const, key: "mode", label: "Mode", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] };
    const secret = { kind: "secret" as const, key: "token", label: "Token", required: false };
    const base = { id: "svc", label: "Service", search: true, fetch: false, urlPatterns: [], create };
    service.web.declare("v1", [{ ...base, settings: [choice, secret] }], life.group("call"));
    for (const settings of [{ mode: "c" }, { other: "a" }])
      await expect(service.execute({ type: "webProvider.save", id: "svc", enabled: true, settings })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(service.execute({ type: "webProvider.save", id: "missing", enabled: true, settings: {} }))
      .rejects.toMatchObject({ code: "not_found" });
    await service.execute({ type: "webProvider.save", id: "svc", enabled: true, settings: { mode: "b", token: " token-value " } });
    expect(service.current().webProviders[0]?.settings).toEqual({ mode: "b", token: "token-value" });
    service.web.removeOwners(["v1"]);
    service.web.declare("v2", [{ ...base, settings: [choice] }], life.group("call"));
    await service.execute({ type: "webProvider.save", id: "svc", enabled: true, settings: { mode: "b" } });
    expect(service.current().webProviders[0]).toEqual({ id: "svc", enabled: true, settings: { mode: "b" } });
    expect(readFileSync(join(root, "configuration.json"), "utf8")).not.toContain("token-value");
  });
  // A saved provider must be usable: a required secret can be replaced but never left blank, including on first save.
  it("rejects saves that would leave a required secret blank", async () => {
    const { service } = setup();
    const life = new RunLifecycle(() => {});
    cleanups.push(() => life.stop());
    service.web.declare("test.web", [{ id: "keyed", label: "Keyed", search: true, fetch: false, urlPatterns: [],
      settings: [{ kind: "secret", key: "apiKey", label: "API key", required: true }],
      create: () => ({ search: async () => ({ documents: [], hints: [] }) }) }], life.group("call"));
    const save = (settings: Record<string, string>) => service.execute({ type: "webProvider.save", id: "keyed", enabled: true, settings });
    await expect(save({})).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.current().webProviders).toEqual([]);
    await save({ apiKey: "key" });
    await expect(save({ apiKey: " " })).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.current().webProviders[0]?.settings).toEqual({ apiKey: "key" });
  });
  // Editing rules persist independently per connection; fixed authentication still permits key replacement.
  it("preset fixed fields survive reopen while connection identity and keys remain editable", async () => {
    const { service, root } = setup();
    const value = { ...modelProviderPresetDraft(modelProviderPresets.find(preset => preset.id === "kimi")!), enabled: true, apiKey: "first-key" };
    await service.execute({ type: "modelProvider.save", id: null, value });
    const renamed = { ...value, id: "personal-kimi", name: "Personal", enabled: false, apiKey: "replacement-key" };
    await service.execute({ type: "modelProvider.save", id: value.id, value: renamed });
    const saved = service.current().modelProviders[0]!;
    expect(saved).toMatchObject(renamed);
    expect(await service.executionCredential(saved.id)).toBe("replacement-key");
    expect(JSON.parse(readFileSync(join(root, "configuration.json"), "utf8")).modelProviders[0]).not.toHaveProperty("kind");
    service.close();
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.current().modelProviders[0]).toMatchObject(renamed);
    await reopened.execute({ type: "modelProvider.save", id: renamed.id, value: { ...renamed, enabled: true } });
    expect(reopened.current().modelProviders[0]).toMatchObject({ enabled: true, apiKey: "replacement-key", fixedFields: value.fixedFields });
  });

  // Authentication changes must validate against the resulting connection; unauthenticated connections carry no key.
  it("requires a model API key and removes it when switching to unauthenticated access", async () => {
    const { service, root } = setup();
    const keyed = { ...providerValue, auth: "api_key" as const };
    await expect(service.execute({ type: "modelProvider.save", id: null, value: keyed })).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.current().modelProviders).toEqual([]);
    await service.execute({ type: "modelProvider.save", id: null, value: { ...keyed, apiKey: "model-key" } });
    await expect(service.execute({ type: "modelProvider.save", id: keyed.id, value: { ...keyed, apiKey: " " } }))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(await service.executionCredential(keyed.id)).toBe("model-key");
    await service.execute({ type: "modelProvider.save", id: keyed.id, value: { ...keyed, auth: "none", apiKey: "model-key" } });
    expect(service.current().modelProviders[0]).toMatchObject({ auth: "none", apiKey: "" });
    expect(readFileSync(join(root, "configuration.json"), "utf8")).not.toContain("model-key");
  });

  // Hidden does not mean immutable: the command boundary rejects fixed-value changes and rule removal without contaminating configuration or credentials.
  it("save commands cannot rewrite fixed fields or rules and models cannot override fixed compatibility settings", async () => {
    const { service, root } = setup();
    const value = { ...modelProviderPresetDraft(modelProviderPresets.find(preset => preset.id === "kimi")!), enabled: true, apiKey: "original-key" };
    await service.execute({ type: "modelProvider.save", id: null, value });
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    const changes: Partial<ModelProviderInput>[] = [
      { protocol: "openai-chat" }, { baseUrl: "https://relay.test/v1" }, { auth: "none" },
      { compatibility: [] }, { fixedFields: [] }, { fixedFields: undefined },
    ];
    for (const change of changes) {
      await expect(service.execute({ type: "modelProvider.save", id: value.id, value: { ...value, ...change, apiKey: "must-not-replace" } })).rejects.toMatchObject({
        code: "invalid_request", display: { id: "providerEditing.fixed" },
      });
    }
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    const saved = service.current().modelProviders[0]!;
    expect(await service.executionCredential(saved.id)).toBe("original-key");
    const model = createModelInput(value.id, { modelId: "test", name: "Test" });
    await expect(service.execute({ type: "model.save", id: null, value: { ...model,
      compatibility: [{ id: "responsesReasoning", value: { summary: true } }] } })).rejects.toMatchObject({ code: "invalid_request" });
    await service.execute({ type: "model.save", id: null, value: model });
    await service.execute({ type: "model.save", id: `${value.id}/test`, value: { ...model, name: "Renamed model" } });
    expect(service.current().models[0]).toMatchObject({ name: "Renamed model", compatibility: [] });
  });

  // Legacy connections without rules retain custom behavior even when names or addresses match presets; existing configuration is not adopted automatically.
  it("connections without declared rules can edit all connection fields", async () => {
    const { service, root } = setup();
    const value = { ...providerValue, id: "kimi", baseUrl: "https://api.moonshot.ai/v1" };
    await service.execute({ type: "modelProvider.save", id: null, value });
    service.close();
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.current().modelProviders[0]?.fixedFields).toBeUndefined();
    const changed: ModelProvider = { ...value, protocol: "anthropic", baseUrl: "https://relay.test/v1", auth: "api_key", apiKey: "custom-key",
      compatibility: [{ id: "customUserAgent", value: { userAgent: "Asterism" } }] };
    await reopened.execute({ type: "modelProvider.save", id: value.id, value: changed });
    expect(reopened.current().modelProviders[0]).toMatchObject(changed);
    const model = createModelInput(value.id, { modelId: "test", name: "Test" });
    await reopened.execute({ type: "model.save", id: null, value: { ...model, compatibility: [{ id: "systemMessageInMessages" }] } });
    expect(reopened.current().models[0]?.compatibility).toEqual([{ id: "systemMessageInMessages" }]);
  });

  // Lookup needs only the draft's model ID; it must not create configuration records.
  it("returns catalog parameters before a model or connection has been saved", async () => {
    const data: Catalog = { providers: {}, models: { "lab/test-model": {
      id: "lab/test-model", name: "Test", description: "", reasoning: true, tool_call: false,
      limit: { context: 128000, output: 16000 },
    } } };
    const { service, changed } = setup(undefined, 30_000, undefined, async () => data);
    const initial = service.current();
    const result = await service.execute({ type: "model.parameters", modelId: "route/test-model" });
    expect(result.parameterUpdate).toEqual({
      parameters: { contextWindow: 128000, capabilities: { reasoning: true, tools: false }, generation: { maxOutputTokens: 16000 } },
      model: { id: "lab/test-model", name: "Test", inputModalities: [] }, unfilled: ["thinkingLevels", "cost"],
    });
    expect(result.savedId).toBeNull();
    expect(service.current()).toEqual(initial);
    expect(changed).not.toHaveBeenCalled();
  });

  it("successful and failed catalog lookups leave saved configuration unchanged", async () => {
    const catalog = vi.fn<LoadModelCatalog>(async () => ({ providers: {}, models: {
      "lab/test-model": { id: "lab/test-model", name: "Test", description: "", limit: { context: 128000 } },
    } }));
    const { service, root, changed } = setup(undefined, 30_000, undefined, catalog);
    const { snapshot } = await addModel(service);
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    changed.mockClear();
    await service.execute({ type: "model.parameters", modelId: "test-model" });
    expect(service.current()).toEqual(snapshot);
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    expect(changed).not.toHaveBeenCalled();
    catalog.mockRejectedValueOnce(new Error("Sensitive upstream diagnostic"));
    await expect(service.execute({ type: "model.parameters", modelId: "test-model" }))
      .rejects.toMatchObject({ code: "unavailable", message: "Model catalog request failed.", display: { id: "modelCatalog.failed" } });
    expect(service.current()).toEqual(snapshot);
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    expect(changed).not.toHaveBeenCalled();
  });

  // Adding optional pricing data must not prevent opening existing configuration, treat missing pricing as zero, or rewrite the original file.
  it("existing models without cost fields load with unknown pricing", async () => {
    const { service, root } = setup();
    await addModel(service);
    service.close();
    const path = join(root, "configuration.json");
    const document = JSON.parse(readFileSync(path, "utf8"));
    delete document.models[0].cost;
    const original = JSON.stringify(document);
    writeFileSync(path, original);
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.current().models[0]?.cost).toBeNull();
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("cancels catalog requests on exit", async () => {
    let finish!: (catalog: Catalog) => void;
    let signal!: AbortSignal;
    const catalog: LoadModelCatalog = input => { signal = input; return new Promise(resolve => { finish = resolve; }); };
    const { service } = setup(undefined, 30_000, undefined, catalog);
    const request = service.execute({ type: "model.parameters", modelId: "test-model" });
    const closed = expect(request).rejects.toMatchObject({ code: "unavailable" });
    service.close();
    expect(signal.aborted).toBe(true);
    finish({ providers: {}, models: {} });
    await closed;
  });

  // Both layers save explicit entries independently; reference protocols do not block saving, and invalid candidates cannot contaminate saved data.
  it.each(["modelProvider", "model"] as const)("%s compatibility entries save independently and reopen; invalid entries are rejected and removed entries do not reappear", async kind => {
    const { service, root } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const value = snapshot.models[0]!;
    const save = (target: ConfigurationService, compatibility: ModelCompatibility[]) => kind === "modelProvider"
      ? target.execute({ type: "modelProvider.save", id: providerId, value: { ...providerValue, compatibility } })
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
    const reopened = new ConfigurationService(root);
    cleanups.push(() => reopened.close());
    expect(reopened.current()[kind === "modelProvider" ? "modelProviders" : "models"][0]?.compatibility).toEqual(compatibility);
    expect(reopened.current()[kind === "modelProvider" ? "models" : "modelProviders"][0]?.compatibility).toEqual([]);
    expect(reopened.current().modelProviders[0]?.protocol).toBe("openai-chat");
    await save(reopened, []);
    const again = new ConfigurationService(root);
    cleanups.push(() => again.close());
    expect(again.current()[kind === "modelProvider" ? "modelProviders" : "models"][0]?.compatibility).toEqual([]);
  });

  it("configuration reopens with plaintext credentials independently of the database", async () => {
    const { service, root } = setup();
    const { providerId } = await addModel(service, "api_key");
    // An empty level set is valid; saving and reopening do not rewrite configuration when the current role's level is unavailable.
    const model = service.current().models[0]!;
    const modelValue = model;
    await service.execute({ type: "model.save", id: `${model.providerId}/${model.modelId}`,
      value: { ...modelValue, capabilities: { ...model.capabilities, reasoning: true, thinkingLevels: [] } } });
    expect(existsSync(join(root, "db"))).toBe(false);
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toContain("test-key-not-for-network");
    expect(existsSync(join(root, "credentials"))).toBe(false);
    service.close();
    const reopened = new ConfigurationService(root);
    try {
      const result = await reopened.execute({ type: "read" });
      expect(result.snapshot.modelProviders[0]).toMatchObject({ id: providerId, apiKey: "test-key-not-for-network" });
      expect(result.snapshot.models).toHaveLength(1);
      expect(result.snapshot.models[0]!.capabilities).toMatchObject({ reasoning: true, thinkingLevels: [] });
    } finally { reopened.close(); }
  });
  it("deleting a provider and its models preserves old snapshots and makes invalid IDs fail explicitly", async () => {
    const { service } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const removed = await service.execute({ type: "remove", kind: "modelProvider", id: providerId});
    expect(removed.snapshot.models).toEqual([]);
    expect(snapshot.models).toHaveLength(1);
    await expect(service.execute({ type: "test.start", model: modelId })).rejects.toMatchObject({ code: "not_found" });
  });
  it("connection tests immediately return an ID without blocking configuration reads; late success after cancellation cannot overwrite results", async () => {
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
  it("unauthenticated configuration discards a submitted key", async () => {
    const { service, root } = setup();
    const { providerId } = await addModel(service, "api_key");
    const result = await service.execute({ type: "modelProvider.save", id: providerId, value: { ...providerValue, apiKey: "must-not-be-stored" } });
    expect(result.snapshot.modelProviders[0]?.apiKey).toBe("");
    expect(readFileSync(join(root, "configuration.json"), "utf8")).not.toMatch(/must-not-be-stored|test-key-not-for-network/);
  });
  it("save failures preserve in-memory configuration and old credentials while cleaning up temporary files", async () => {
    const { service, root } = setup();
    const { providerId } = await addModel(service, "api_key");
    const before = (await service.execute({ type: "read" })).snapshot;
    const path = join(root, "configuration.json");
    const content = readFileSync(path, "utf8");
    // A directory with the same name makes the final rename fail explicitly without relying on the current user's file permissions.
    rmSync(path);
    mkdirSync(path);
    try {
      await expect(service.execute({ type: "modelProvider.save", id: providerId,
        value: { ...providerValue, name: "Must not commit", auth: "api_key", apiKey: "replacement-test-key" } })).rejects.toThrow();
      expect((await service.execute({ type: "read" })).snapshot.modelProviders).toEqual(before.modelProviders);
      expect(await service.executionCredential(providerId)).toBe("test-key-not-for-network");
      expect(readdirSync(root).some(file => file.endsWith(".tmp"))).toBe(false);
    } finally {
      rmSync(path, { recursive: true });
      writeFileSync(path, content);
    }
    service.close();
    const reopened = new ConfigurationService(root);
    try {
      expect((await reopened.execute({ type: "read" })).snapshot.modelProviders[0]).toMatchObject({ id: providerId, name: "Local" });
    } finally { reopened.close(); }
  });
  it.each(["invalid JSON", "unsupported version", "missing configuration category", "duplicate identity"])("%s does not reset or overwrite original configuration", async scenario => {
    const { root, service } = setup(); await addModel(service); service.close();
    const file = join(root, "configuration.json"), document = JSON.parse(readFileSync(file, "utf8"));
    if (scenario === "unsupported version") document.version = 999;
    else if (scenario === "missing configuration category") delete document.models;
    else if (scenario === "duplicate identity") document.models.push(structuredClone(document.models[0]));
    const content = scenario === "invalid JSON" ? "{broken" : JSON.stringify(document);
    writeFileSync(file, content);
    expect(() => new ConfigurationService(root)).toThrow();
    expect(readFileSync(file, "utf8")).toBe(content);
  });
  it("closing the service cancels in-flight connection tests and rejects subsequent commands", async () => {
    const probe = vi.fn<ConnectionProbe>(async ({ signal }) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
    const { service } = setup(probe);
    const { modelId } = await addModel(service);
    await service.execute({ type: "test.start", model: modelId });
    service.close();
    expect(probe.mock.calls[0]![0].signal.aborted).toBe(true);
    await expect(service.execute({ type: "read" })).rejects.toMatchObject({ code: "unavailable" });
  });

});
