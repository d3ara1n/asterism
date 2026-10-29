import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelInput, type ModelProviderInput } from "../shared/configuration.ts";
import { modelProviderPresetDraft } from "../shared/provider-presets.ts";
import { modelProviderPresets } from "../../packages/builtin/src/providers/presets.ts";
import { ConfigurationService } from "./service.ts";
import type { ConnectionProbe } from "./probe.ts";
import type { ModelCompatibility } from "../shared/model-compatibility.ts";
import type { DiscoverModels } from "./discovery.ts";
import type { LoadModelCatalog } from "./model-catalog.ts";
import type { Catalog } from "@opencode-ai/models";
import { z } from "zod";
import { RunLifecycle } from "../plugins/lifecycle.ts";

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
  const provider = await service.execute({ type: "modelProvider.save", id: null, value: { ...providerValue, auth },
    credential: auth === "none" ? { action: "keep" } : { action: "replace", value: "test-key-not-for-network" } });
  const model = await service.execute({ type: "model.save", id: null, value: {
    providerId: provider.savedId!, name: "Test model", modelId: "test-model", enabled: true, contextWindow: 32000, cost: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { providerId: provider.savedId!, modelId: model.savedId!, snapshot: model.snapshot };
}

describe("Real configuration and consumption boundaries", () => {
  it("persists web provider order without changing credentials or enablement", async () => {
    const { service, root, protector } = setup();
    const life = new RunLifecycle(() => {});
    cleanups.push(() => life.stop());
    const create = vi.fn(() => ({ fetch: async () => ({ documents: [], hints: [] }) }));
    const definition = { id: "test-web", label: "Test web", search: false, fetch: true, urlPatterns: ["*"],
      defaultBaseUrl: "https://web.test", credential: { kind: "api_key" as const }, create };
    service.web.declare("test.web", [definition], life.group("call"));
    await service.execute({ type: "webProvider.save", id: definition.id, enabled: true,
      credential: { action: "replace", value: "web-key" } });
    await service.execute({ type: "webProvider.save", id: "other", enabled: false, credential: { action: "keep" } });
    await service.execute({ type: "webProvider.reorder", ids: ["other", definition.id] });
    for (const ids of [[definition.id], ["other", "other"], ["other", "unknown"]]) {
      await expect(service.execute({ type: "webProvider.reorder", ids })).rejects.toMatchObject({ code: "invalid_request" });
    }
    const disk = readFileSync(join(root, "configuration.json"), "utf8");
    expect(disk).not.toContain("web-key");
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    reopened.web.declare("test.web", [definition], life.group("call"));
    expect(reopened.current().webProviders.map(item => [item.id, item.enabled])).toEqual([["other", false], [definition.id, true]]);
    await reopened.web.resolve(definition.id, { signal: new AbortController().signal });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ credential: "web-key", baseUrl: definition.defaultBaseUrl }));
    // Updating a reordered provider preserves its position.
    await reopened.execute({ type: "webProvider.save", id: definition.id, enabled: false,
      credential: { action: "replace", value: "new-key" } });
    expect(reopened.current().webProviders[1]).toMatchObject({ id: definition.id, enabled: false, credentialState: "available" });
  });
  // Editing rules must persist independently per connection; fixed auth methods cannot prevent renaming, toggling, or credential management.
  it("preset fixed fields survive reopen while connection identity and keys remain editable", async () => {
    const { service, root, protector } = setup();
    const value = { ...modelProviderPresetDraft(modelProviderPresets.find(preset => preset.id === "kimi")!), enabled: true };
    await service.execute({ type: "modelProvider.save", id: null, value, credential: { action: "replace", value: "first-key" } });
    const renamed = { ...value, id: "personal-kimi", name: "Personal", enabled: false };
    await service.execute({ type: "modelProvider.save", id: value.id, value: renamed, credential: { action: "replace", value: "replacement-key" } });
    const saved = service.current().modelProviders[0]!;
    expect(saved).toMatchObject({ ...renamed, credentialState: "available" });
    expect(await service.executionCredential(saved.id)).toBe("replacement-key");
    expect(JSON.parse(readFileSync(join(root, "configuration.json"), "utf8")).modelProviders[0]).not.toHaveProperty("kind");
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().modelProviders[0]).toMatchObject(renamed);
    await reopened.execute({ type: "modelProvider.save", id: renamed.id, value: { ...renamed, enabled: true }, credential: { action: "clear" } });
    expect(reopened.current().modelProviders[0]).toMatchObject({ enabled: true, credentialState: "missing", fixedFields: value.fixedFields });
  });

  // Hidden does not mean immutable: the command boundary rejects fixed-value changes and rule removal without contaminating configuration or credentials.
  it("save commands cannot rewrite fixed fields or rules and models cannot override fixed compatibility settings", async () => {
    const { service, root } = setup();
    const value = { ...modelProviderPresetDraft(modelProviderPresets.find(preset => preset.id === "kimi")!), enabled: true };
    await service.execute({ type: "modelProvider.save", id: null, value, credential: { action: "replace", value: "original-key" } });
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    const changes: Partial<ModelProviderInput>[] = [
      { protocol: "openai-chat" }, { baseUrl: "https://relay.test/v1" }, { auth: "none" },
      { compatibility: [] }, { fixedFields: [] }, { fixedFields: undefined },
    ];
    for (const change of changes) {
      await expect(service.execute({ type: "modelProvider.save", id: value.id, value: { ...value, ...change },
        credential: { action: "replace", value: "must-not-replace" } })).rejects.toMatchObject({
        code: "invalid_request", display: { id: "providerEditing.fixed" },
      });
    }
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    const saved = service.current().modelProviders[0]!;
    expect(await service.executionCredential(saved.id)).toBe("original-key");
    expect(readdirSync(join(root, "credentials"))).toHaveLength(1);
    const model = createModelInput(value.id, { modelId: "test", name: "Test" });
    await expect(service.execute({ type: "model.save", id: null, value: { ...model,
      compatibility: [{ id: "responsesReasoning", value: { summary: true } }] } })).rejects.toMatchObject({ code: "invalid_request" });
    await service.execute({ type: "model.save", id: null, value: model });
    await service.execute({ type: "model.save", id: `${value.id}/test`, value: { ...model, name: "Renamed model" } });
    expect(service.current().models[0]).toMatchObject({ name: "Renamed model", compatibility: [] });
  });

  // Legacy connections without rules retain custom behavior even when names or addresses match presets; existing configuration is not adopted automatically.
  it("connections without declared rules can edit all connection fields", async () => {
    const { service, root, protector } = setup();
    const value = { ...providerValue, id: "kimi", baseUrl: "https://api.moonshot.ai/v1" };
    await service.execute({ type: "modelProvider.save", id: null, value, credential: { action: "keep" } });
    service.close();
    const reopened = new ConfigurationService(root, protector);
    cleanups.push(() => reopened.close());
    expect(reopened.current().modelProviders[0]?.fixedFields).toBeUndefined();
    const changed: ModelProviderInput = { ...value, protocol: "anthropic", baseUrl: "https://relay.test/v1", auth: "api_key",
      compatibility: [{ id: "customUserAgent", value: { userAgent: "Asterism" } }] };
    await reopened.execute({ type: "modelProvider.save", id: value.id, value: changed, credential: { action: "replace", value: "custom-key" } });
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
    const { service, changed } = setup(undefined, false, 30_000, undefined, async () => data);
    const initial = service.current();
    const result = await service.execute({ type: "model.parameters", modelId: "route/test-model" });
    expect(result.parameterUpdate).toEqual({
      parameters: { contextWindow: 128000, capabilities: { reasoning: true, tools: false }, generation: { maxOutputTokens: 16000 } },
      source: "lab/test-model", unfilled: ["thinkingLevels", "cost"],
    });
    expect(result.savedId).toBeNull();
    expect(service.current()).toEqual(initial);
    expect(changed).not.toHaveBeenCalled();
  });

  it("successful and failed catalog lookups leave saved configuration unchanged", async () => {
    const catalog = vi.fn<LoadModelCatalog>(async () => ({ providers: {}, models: {
      "lab/test-model": { id: "lab/test-model", name: "Test", description: "", limit: { context: 128000 } },
    } }));
    const { service, root, changed } = setup(undefined, true, 30_000, undefined, catalog);
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

  it("cancels catalog requests on exit", async () => {
    let finish!: (catalog: Catalog) => void;
    let signal!: AbortSignal;
    const catalog: LoadModelCatalog = input => { signal = input; return new Promise(resolve => { finish = resolve; }); };
    const { service } = setup(undefined, true, 30_000, undefined, catalog);
    const request = service.execute({ type: "model.parameters", modelId: "test-model" });
    const closed = expect(request).rejects.toMatchObject({ code: "unavailable" });
    service.close();
    expect(signal.aborted).toBe(true);
    finish({ providers: {}, models: {} });
    await closed;
  });

  // Both layers save explicit entries independently; reference protocols do not block saving, and invalid candidates cannot contaminate saved data.
  it.each(["modelProvider", "model"] as const)("%s compatibility entries save independently and reopen; invalid entries are rejected and removed entries do not reappear", async kind => {
    const { service, root, protector } = setup();
    const { providerId, modelId, snapshot } = await addModel(service);
    const value = snapshot.models[0]!;
    const save = (target: ConfigurationService, compatibility: ModelCompatibility[]) => kind === "modelProvider"
      ? target.execute({ type: "modelProvider.save", id: providerId, value: { ...providerValue, compatibility }, credential: { action: "keep" } })
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
    expect(reopened.current()[kind === "modelProvider" ? "modelProviders" : "models"][0]?.compatibility).toEqual(compatibility);
    expect(reopened.current()[kind === "modelProvider" ? "models" : "modelProviders"][0]?.compatibility).toEqual([]);
    expect(reopened.current().modelProviders[0]?.protocol).toBe("openai-chat");
    await save(reopened, []);
    const again = new ConfigurationService(root, protector);
    cleanups.push(() => again.close());
    expect(again.current()[kind === "modelProvider" ? "modelProviders" : "models"][0]?.compatibility).toEqual([]);
  });

  it("configuration reopens independently of the database; keys enter only the encrypted file, never configuration or UI responses", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    // An empty level set is valid; saving and reopening do not rewrite configuration when the current role's level is unavailable.
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
      expect(result.snapshot.modelProviders[0]).toMatchObject({ id: providerId, credentialState: "available" });
      expect(result.snapshot.models).toHaveLength(1);
      expect(result.snapshot.models[0]!.capabilities).toMatchObject({ reasoning: true, thinkingLevels: [] });
      expect(JSON.stringify(result)).not.toMatch(/test-key-not-for-network|credentialRef|ciphertext/);
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
  it("rejects saving keys without credential protection rather than persisting plaintext", async () => {
    const { service, root } = setup(undefined, false);
    await expect(addModel(service, "api_key")).rejects.toThrow();
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
    expect(JSON.stringify((await service.execute({ type: "read" })).snapshot)).not.toContain("test-key-not-for-network");
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
  it("replacing and deleting credentials removes old ciphertext; encryption failure preserves original configuration", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    const first = readdirSync(join(root, "credentials"))[0]!;
    const save = { type: "modelProvider.save" as const, id: providerId, value: { ...providerValue, auth: "api_key" as const },
      credential: { action: "replace" as const, value: "replacement-test-key" } };
    protector.encrypt.mockRejectedValueOnce(new Error("Sensitive system detail"));
    await expect(service.execute(save)).rejects.toThrow();
    expect(readdirSync(join(root, "credentials"))).toEqual([first]);
    await service.execute(save);
    const files = readdirSync(join(root, "credentials"));
    expect(files).toHaveLength(1);
    expect(files[0]).not.toBe(first);
    await service.execute({ type: "remove", kind: "modelProvider", id: providerId});
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
  });
  it("unauthenticated configuration ignores key replacement intent and removes old credentials", async () => {
    const { service, root, protector } = setup();
    const { providerId } = await addModel(service, "api_key");
    protector.encrypt.mockClear();
    const result = await service.execute({ type: "modelProvider.save", id: providerId, value: providerValue, credential: { action: "replace", value: "must-not-be-stored" } });
    expect(result.snapshot.modelProviders[0]?.credentialState).toBe("not_required");
    expect(protector.encrypt).not.toHaveBeenCalled();
    expect(readdirSync(join(root, "credentials"))).toEqual([]);
  });
  it("save failures preserve in-memory configuration and old credentials while cleaning up new ciphertext and temporary files", async () => {
    const { service, root } = setup();
    const { providerId } = await addModel(service, "api_key");
    const before = (await service.execute({ type: "read" })).snapshot;
    const credentials = readdirSync(join(root, "credentials"));
    const path = join(root, "configuration.json");
    const content = readFileSync(path, "utf8");
    // A directory with the same name makes the final rename fail explicitly without relying on the current user's file permissions.
    rmSync(path);
    mkdirSync(path);
    try {
      await expect(service.execute({ type: "modelProvider.save", id: providerId,
        value: { ...providerValue, name: "Must not commit", auth: "api_key" },
        credential: { action: "replace", value: "replacement-test-key" } })).rejects.toThrow();
      expect((await service.execute({ type: "read" })).snapshot.modelProviders).toEqual(before.modelProviders);
      expect(readdirSync(join(root, "credentials"))).toEqual(credentials);
      expect(readdirSync(root).some(file => file.endsWith(".tmp"))).toBe(false);
    } finally {
      rmSync(path, { recursive: true });
      writeFileSync(path, content);
    }
    service.close();
    const reopened = new ConfigurationService(root, { available: async () => false, encrypt: async () => "", decrypt: async () => "" });
    try {
      expect((await reopened.execute({ type: "read" })).snapshot.modelProviders[0]).toMatchObject({ id: providerId, name: "Local" });
    } finally { reopened.close(); }
  });
  it.each(["invalid JSON", "unsupported version", "missing configuration category", "duplicate identity"])("%s does not reset or overwrite original configuration", async scenario => {
    const { root, service, protector } = setup(); await addModel(service); service.close();
    const file = join(root, "configuration.json"), document = JSON.parse(readFileSync(file, "utf8"));
    if (scenario === "unsupported version") document.version = 999;
    else if (scenario === "missing configuration category") delete document.models;
    else if (scenario === "duplicate identity") document.models.push(structuredClone(document.models[0]));
    const content = scenario === "invalid JSON" ? "{broken" : JSON.stringify(document);
    writeFileSync(file, content);
    expect(() => new ConfigurationService(root, protector)).toThrow();
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
