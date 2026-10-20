import { randomUUID } from "node:crypto";
import { configurationCommandSchema, createModelInput, modelReference, providerSchema, resolveProviderModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ConnectionTest, type Provider, type ProviderModel, type ModelParameterUpdate } from "../shared/configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import { unauthenticatedApiKey } from "../shared/model.ts";
import { ConfigurationError } from "./errors.ts";
import { ConfigurationStore, type StoredProvider } from "./store.ts";
import { CredentialVault } from "./credentials.ts";
import { classifyProbeError, runConnectionProbe, type ConnectionProbe } from "./probe.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";
import { discoverModels, ModelDiscoveries, type DiscoverModels } from "./discovery.ts";
import { loadModelCatalog, modelParameters, type LoadModelCatalog } from "./model-catalog.ts";
import { modelCatalogMessages } from "../shared/model-catalog-messages.ts";
import { ProviderExtensions } from "./provider-extensions.ts";

const saveKinds = { "provider.save": "provider", "model.save": "model", "role.save": "role", "agent.save": "agent" } as const;

export class ConfigurationService {
  readonly extensions = new ProviderExtensions();
  private readonly providerListeners = new Set<() => void>();
  subscribeProviders(listener: () => void): () => void {
    this.providerListeners.add(listener);
    const release = this.extensions.subscribe(listener);
    return () => { this.providerListeners.delete(listener); release(); };
  }
  private providersChanged() { for (const listener of this.providerListeners) listener(); }
  private readonly store: ConfigurationStore;
  /** 宿主凭据库；插件凭据以独立引用存于同一 vault。 */
  readonly vault: CredentialVault;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private storageAvailable = false;
  private readonly discoveries: ModelDiscoveries;
  private readonly shutdown = new AbortController();
  private readonly parameterRequests = new Set<{ model: string; providerId: string; controller: AbortController }>();
  private tests = new Map<string, { value: ConnectionTest; controller: AbortController; timer: ReturnType<typeof setTimeout>; started: number }>();
  constructor(root: string, protector: SecretProtector, private readonly onChanged: () => void = () => {},
    private readonly probe: ConnectionProbe = runConnectionProbe, private readonly testTimeoutMs = 30_000,
    discover: DiscoverModels = discoverModels, private readonly catalog: LoadModelCatalog = loadModelCatalog) {
    this.store = new ConfigurationStore(root);
    this.vault = new CredentialVault(root, protector);
    this.discoveries = new ModelDiscoveries(onChanged, discover, testTimeoutMs);
  }
  execute(raw: ConfigurationCommand): Promise<{ snapshot: ConfigurationSnapshot; savedId: string | null; parameterUpdate?: ModelParameterUpdate }> {
    const parsed = configurationCommandSchema.safeParse(raw);
    if (!parsed.success) return Promise.reject(new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values."));
    if (parsed.data.type === "model.parameters") return this.fetchParameters(parsed.data.model);
    const command = parsed.data;
    return this.enqueue(async () => {
      this.assertOpen();
      this.storageAvailable = await this.vault.available();
      this.assertOpen();
      const savedId = await this.perform(command);
      if (command.type === "provider.save" || command.type === "remove" && command.kind === "provider") this.providersChanged();
      if (command.type !== "read") this.onChanged();
      return { snapshot: this.snapshot(), savedId };
    });
  }
  private enqueue<T>(work: () => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(work);
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async fetchParameters(reference: string) {
    const captured = await this.enqueue(() => {
      this.assertOpen();
      const model = this.store.get("model", reference);
      const provider = model && this.store.get("provider", model.providerId);
      if (!model || !provider) throw new ConfigurationError("not_found", "The model or provider no longer exists.");
      const request = { model: reference, providerId: provider.id, controller: new AbortController() };
      this.parameterRequests.add(request);
      return { model, provider, request };
    });
    const timeout = AbortSignal.timeout(10_000);
    const signal = AbortSignal.any([timeout, this.shutdown.signal, captured.request.controller.signal]);
    try {
      let catalog;
      try { catalog = await this.catalog(signal); signal.throwIfAborted(); }
      catch {
        if (captured.request.controller.signal.aborted)
          throw new ConfigurationError("conflict", "The model or provider changed during parameter retrieval.", modelCatalogMessages.changed);
        throw new ConfigurationError("unavailable", "Model catalog request failed.",
          timeout.aborted ? modelCatalogMessages.timeout : modelCatalogMessages.failed);
      }
      return await this.enqueue(() => {
        this.assertOpen();
        if (captured.request.controller.signal.aborted ||
            this.store.get("model", reference)?.revision !== captured.model.revision ||
            this.store.get("provider", captured.provider.id)?.revision !== captured.provider.revision)
          throw new ConfigurationError("conflict", "The model or provider changed during parameter retrieval.", modelCatalogMessages.changed);
        const { value, report } = modelParameters(catalog, captured.model);
        this.store.save({ kind: "model", id: reference, value });
        this.parameterRequests.delete(captured.request);
        this.invalidateParameterRequests("model", reference);
        return { snapshot: this.snapshot(), savedId: reference, parameterUpdate: report };
      });
    } finally { this.parameterRequests.delete(captured.request); }
  }
  private invalidateParameterRequests(kind: string, id: string): void {
    for (const request of this.parameterRequests)
      if ((kind === "model" && request.model === id) || (kind === "provider" && request.providerId === id))
        request.controller.abort();
  }
  private assertOpen(): void { if (this.closed) throw new ConfigurationError("unavailable", "Configuration service is unavailable."); }
  /** 同步取得当前生效配置；凭据状态沿用最近一次检查结果。 */
  current(): ConfigurationSnapshot { this.assertOpen(); return this.snapshot(); }
  async executionCredential(providerId: string, revision: number): Promise<string | null> {
    this.assertOpen();
    const provider = this.store.get("provider", providerId);
    if (!provider || provider.revision !== revision) throw new ConfigurationError("conflict", "The provider changed before execution started.");
    if (provider.auth === "none") return unauthenticatedApiKey;
    return provider.credentialRef ? this.vault.read(provider.credentialRef) : null;
  }
  private provider(stored: StoredProvider): Provider {
    const { credentialRef: ref, ...value } = stored;
    const credentialState = stored.auth === "none" ? "not_required" : !ref || !this.vault.exists(ref) ? "missing"
      : !this.storageAvailable ? "storage_unavailable" : this.vault.failures.has(ref) ? "decryption_failed" : "available";
    return providerSchema.parse({ ...value, credentialState });
  }
  private snapshot(): ConfigurationSnapshot {
    const roles = this.store.list("role");
    const agents = this.store.list("agent");
    return {
      providers: this.store.list("provider").map(provider => this.provider(provider)),
      providerPresets: this.extensions.presets(), usageProviders: this.extensions.usageProviders(),
      models: this.store.list("model"),
      roles: roles.map(role => resolveRoleConfiguration(role)),
      agents: agents.map(agent => resolveAgentConfiguration(agent)),
      defaults: structuredClone(configurationDefaults),
      overrides: {
        roles: Object.fromEntries(roles.map(role => [role.id, role.overrides])),
        agents: Object.fromEntries(agents.map(agent => [agent.id, agent.overrides])),
      },
      tests: [...this.tests.values()].map(test => ({ ...test.value })), discoveries: this.discoveries.snapshot(), credentialStorageAvailable: this.storageAvailable,
    };
  }
  private async perform(command: Exclude<ConfigurationCommand, { type: "model.parameters" }>): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "test.start") return this.startTest(command.model);
    if (command.type === "test.cancel") { this.cancelTest(command.id); return command.id; }
    if (command.type === "discovery.start") {
      const stored = this.store.get("provider", command.providerId);
      if (!stored) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
      return this.discoveries.start(this.provider(stored), async () => {
        if (stored.auth === "none") return "";
        if (!stored.credentialRef) throw new Error("Credential is unavailable.");
        return this.vault.read(stored.credentialRef);
      });
    }
    if (command.type === "discovery.cancel") { this.discoveries.cancel(command.id); return command.id; }
    if (command.type === "discovery.add") {
      const discovery = this.discoveries.get(command.id);
      const provider = this.store.get("provider", discovery.providerId);
      if (discovery.state !== "succeeded" || !provider || provider.revision !== discovery.providerRevision)
        throw new ConfigurationError("conflict", "The provider or model list changed. Fetch models again.");
      const models = new Map(discovery.models.map(model => [model.modelId, model]));
      const selected = [...new Set(command.modelIds)].map(id => {
        const model = models.get(id);
        if (!model) throw new ConfigurationError("invalid_request", "The selected model is not in this model list.");
        return createModelInput(provider.id, model);
      });
      this.store.addModels(selected);
      return provider.id;
    }
    if (command.type === "remove") {
      const { credentialRef } = this.store.remove(command.kind, command.id);
      this.invalidateParameterRequests(command.kind, command.id);
      if (command.kind === "provider") this.discoveries.clearProvider(command.id);
      if (credentialRef) this.removeCredential(credentialRef);
      return command.id;
    }
    if (command.id && !this.store.get(saveKinds[command.type], command.id)) throw new ConfigurationError("not_found", "This configuration no longer exists. Reload settings.");
    switch (command.type) {
      case "role.save": case "agent.save": {
        const id = command.id ?? randomUUID();
        this.store.save({ kind: command.type === "role.save" ? "role" : "agent", id, value: command.value } as never);
        return id;
      }
      case "model.save":
        if (!this.store.get("provider", command.value.providerId)) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
        this.store.save({ kind: "model", id: command.id, value: command.value });
        if (command.id) this.invalidateParameterRequests("model", command.id);
        return modelReference(command.value);
      case "provider.save": break;
    }
    const id = command.value.id;
    const oldRef = command.id ? this.store.get("provider", command.id)?.credentialRef ?? null : null;
    let ref = oldRef;
    let newRef: string | null = null;
    try {
      if (command.value.auth === "none" || command.credential.action === "clear") ref = null;
      else if (command.credential.action === "replace") {
        if (!this.storageAvailable) throw new Error("System credential protection is unavailable.");
        newRef = await this.vault.write(command.credential.value);
        ref = newRef;
      }
      this.assertOpen();
      this.store.save({ kind: "provider", id: command.id, value: command.value, credentialRef: ref });
      if (command.id) {
        this.invalidateParameterRequests("provider", command.id);
        this.discoveries.clearProvider(command.id);
      }
    } catch (error) {
      if (newRef) this.removeCredential(newRef);
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError("unavailable", "The connection could not be saved. Check system credential protection and local storage.");
    }
    if (oldRef && oldRef !== ref) this.removeCredential(oldRef);
    return id;
  }
  private removeCredential(ref: string): void {
    try { this.vault.remove(ref); }
    catch { console.error("Unreferenced encrypted credential cleanup failed."); }
  }
  private startTest(modelId: string): string {
    const resolved = resolveProviderModel(this.snapshot(), modelId);
    if (!resolved) throw new ConfigurationError("not_found", "The model or provider no longer exists or is disabled. Reload settings.");
    const { model, provider } = resolved;
    const storedProvider = this.store.get("provider", provider.id)!;
    if ([...this.tests.values()].filter(test => test.value.state === "running").length >= 8) throw new ConfigurationError("conflict", "Too many connection tests are running.");
    for (const [key, test] of this.tests) {
      if (this.tests.size < 50) break;
      if (test.value.state !== "running") this.tests.delete(key);
    }
    const id = randomUUID();
    const controller = new AbortController();
    const value: ConnectionTest = { id, providerId: provider.id, providerRevision: provider.revision, model: modelReference(model), modelRevision: model.revision,
      state: "running", startedAt: new Date().toISOString(), durationMs: null, error: null, message: null };
    const timer = setTimeout(() => {
      this.finishTest(id, { state: "failed", error: "timeout", message: "The connection test timed out." });
      controller.abort();
    }, this.testTimeoutMs);
    this.tests.set(id, { value, controller, timer, started: performance.now() });
    // 配置与修订在点击测试时取得；后续编辑不改变这次请求。
    void this.runTest(id, provider, model, storedProvider.credentialRef, controller.signal);
    return id;
  }
  private async runTest(id: string, provider: Provider, model: ProviderModel, reference: string | null, signal: AbortSignal): Promise<void> {
    let apiKey = "";
    if (provider.auth === "api_key") {
      try {
        if (!reference || !this.storageAvailable) throw new Error("Credential is unavailable.");
        apiKey = await this.vault.read(reference);
      } catch {
        this.finishTest(id, { state: "failed", error: "credential", message: "The credential is missing or cannot be decrypted. Enter it again in settings." });
        return;
      }
    }
    if (signal.aborted || this.closed) return;
    try {
      await this.probe({ provider, model, apiKey, signal });
      this.finishTest(id, { state: "succeeded", error: null, message: "Connection succeeded." });
    } catch (error) {
      if (!signal.aborted) this.finishTest(id, { state: "failed", ...classifyProbeError(error) });
    }
  }
  private finishTest(id: string, result: Pick<ConnectionTest, "state" | "error" | "message">): void {
    const test = this.tests.get(id);
    if (!test || test.value.state !== "running" || this.closed) return;
    clearTimeout(test.timer);
    Object.assign(test.value, result, { durationMs: Math.round(performance.now() - test.started) });
    this.onChanged();
  }
  private cancelTest(id: string): void {
    const test = this.tests.get(id);
    if (!test) throw new ConfigurationError("not_found", "This connection test is no longer available.");
    this.finishTest(id, { state: "cancelled", error: "cancelled", message: "Connection test cancelled." });
    test.controller.abort();
  }
  close(): void {
    this.closed = true;
    this.shutdown.abort();
    this.discoveries.close();
    this.providerListeners.clear();
    for (const test of this.tests.values()) { clearTimeout(test.timer); test.controller.abort(); }
  }
}
