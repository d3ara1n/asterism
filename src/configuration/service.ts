import { configurationCommandSchema, createModelInput, modelReference, modelProviderSchema, resolveProviderModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ModelProvider, type ModelParameterUpdate } from "../shared/configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import { unauthenticatedApiKey } from "../shared/model.ts";
import { ConfigurationError } from "./errors.ts";
import { ConfigurationStore, type StoredModelProvider } from "./store.ts";
import { CredentialVault } from "./credentials.ts";
import { runConnectionProbe, type ConnectionProbe } from "./probe.ts";
import { discoverModels, ModelDiscoveries, type DiscoverModels } from "./discovery.ts";
import { loadModelCatalog, modelParameters, type LoadModelCatalog } from "./model-catalog.ts";
import { modelCatalogMessages } from "../shared/model-catalog-messages.ts";
import { ModelProviderExtensions } from "./provider-extensions.ts";
import { ModelConnectionTests } from "./connection-tests.ts";
import { WebProviderRegistry } from "./web-providers.ts";
import { WebError } from "@asterism-app/sdk/runtime";

const saveKinds = { "modelProvider.save": "modelProvider", "model.save": "model" } as const;

export class ConfigurationService {
  readonly extensions = new ModelProviderExtensions();
  readonly web = new WebProviderRegistry({
    list: () => this.store.list("webProvider").map(({ credentialRef: _ref, ...state }) => state),
    credential: async id => {
      this.assertOpen();
      const stored = this.store.get("webProvider", id);
      if (!stored) throw new WebError("provider_unavailable", `Web provider '${id}' is not configured.`);
      if (!stored.credentialRef) return null;
      try { return await this.vault.read(stored.credentialRef); }
      catch { throw new WebError("credential_unavailable", "The web provider credential could not be read."); }
    },
  });
  private readonly providerListeners = new Set<() => void>();
  subscribeProviders(listener: () => void): () => void {
    this.providerListeners.add(listener);
    const release = this.extensions.subscribe(listener);
    return () => { this.providerListeners.delete(listener); release(); };
  }
  private providersChanged() { for (const listener of this.providerListeners) listener(); }
  private readonly store: ConfigurationStore;
  /** Host credential store; plugin credentials use independent references in the same vault. */
  readonly vault: CredentialVault;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private storageAvailable = false;
  private readonly discoveries: ModelDiscoveries;
  private readonly shutdown = new AbortController();
  private readonly tests: ModelConnectionTests;
  constructor(root: string, protector: SecretProtector, private readonly onChanged: () => void = () => {},
    probe: ConnectionProbe = runConnectionProbe, testTimeoutMs = 30_000,
    discover: DiscoverModels = discoverModels, private readonly catalog: LoadModelCatalog = loadModelCatalog) {
    this.store = new ConfigurationStore(root);
    this.vault = new CredentialVault(root, protector);
    this.discoveries = new ModelDiscoveries(onChanged, discover, testTimeoutMs);
    this.tests = new ModelConnectionTests(onChanged, probe, testTimeoutMs);
  }
  execute(raw: unknown): Promise<{ snapshot: ConfigurationSnapshot; savedId: string | null; parameterUpdate?: ModelParameterUpdate }> {
    const parsed = configurationCommandSchema.safeParse(raw);
    if (!parsed.success) return Promise.reject(new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values."));
    if (parsed.data.type === "model.parameters") return this.fetchParameters(parsed.data.modelId);
    const command = parsed.data;
    return this.enqueue(async () => {
      this.assertOpen();
      this.storageAvailable = await this.vault.available();
      this.assertOpen();
      const savedId = await this.perform(command);
      if (command.type === "modelProvider.save" || command.type === "remove" && command.kind === "modelProvider") this.providersChanged();
      if (command.type === "webProvider.save" || command.type === "webProvider.reorder" || command.type === "remove" && command.kind === "webProvider") this.web.changed();
      if (command.type !== "read") this.onChanged();
      return { snapshot: this.snapshot(), savedId };
    });
  }
  private enqueue<T>(work: () => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(work);
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async fetchParameters(modelId: string) {
    this.assertOpen();
    const timeout = AbortSignal.timeout(10_000);
    const signal = AbortSignal.any([timeout, this.shutdown.signal]);
    let catalog;
    try { catalog = await this.catalog(signal); signal.throwIfAborted(); }
    catch {
      throw new ConfigurationError("unavailable", "Model catalog request failed.",
        timeout.aborted ? modelCatalogMessages.timeout : modelCatalogMessages.failed);
    }
    return this.enqueue(() => {
      this.assertOpen();
      return { snapshot: this.snapshot(), savedId: null, parameterUpdate: modelParameters(catalog, modelId) };
    });
  }
  private assertOpen(): void { if (this.closed) throw new ConfigurationError("unavailable", "Configuration service is unavailable."); }
  /** Synchronously obtain current effective configuration; credential status retains the latest check result. */
  private readonly mcpListeners = new Set<() => void>();
  mcpSettings() { this.assertOpen(); return this.store.mcp(); }
  mcpCredentialReference(key: string) { this.assertOpen(); return this.store.mcpCredentialReference(key); }
  setMcpCredentialReference(key: string, reference: string | null) {
    this.assertOpen();
    this.store.setMcpCredentialReference(key, reference);
  }
  updateMcp(update: (current: ConfigurationSnapshot["mcp"]) => ConfigurationSnapshot["mcp"]): void {
    this.assertOpen();
    this.store.setMcp(update(this.store.mcp()));
    for (const listener of this.mcpListeners) listener();
    this.onChanged();
  }
  subscribeMcp(listener: () => void): () => void {
    this.mcpListeners.add(listener);
    return () => { this.mcpListeners.delete(listener); };
  }
  shellSettings() { this.assertOpen(); return this.store.shell(); }
  current(): ConfigurationSnapshot { this.assertOpen(); return this.snapshot(); }
  async executionCredential(providerId: string): Promise<string | null> {
    this.assertOpen();
    const provider = this.store.get("modelProvider", providerId);
    if (!provider) throw new ConfigurationError("not_found", "The provider no longer exists.");
    if (provider.auth === "none") return unauthenticatedApiKey;
    return provider.credentialRef ? this.vault.read(provider.credentialRef) : null;
  }
  private provider(stored: StoredModelProvider): ModelProvider {
    const { credentialRef: ref, ...value } = stored;
    const credentialState = this.credentialState(stored.auth, ref);
    return modelProviderSchema.parse({ ...value, credentialState });
  }
  /** Runtime consumers read only their domain; the settings snapshot remains a transport projection. */
  modelProviders(): Omit<ModelProvider, "credentialState">[] {
    this.assertOpen();
    return this.store.list("modelProvider").map(({ credentialRef: _ref, ...value }) => value);
  }
  modelCatalog(): Pick<ConfigurationSnapshot, "modelProviders" | "models"> {
    this.assertOpen();
    return { modelProviders: this.store.list("modelProvider").map(provider => this.provider(provider)), models: this.store.list("model") };
  }
  private snapshot(): ConfigurationSnapshot {
    return {
      mcp: this.store.mcp(),
      shell: this.store.shell(),
      sessionEntry: this.store.sessionEntry(),
      webProviders: this.store.list("webProvider").map(({ credentialRef, ...state }) => {
        const type = this.web.types().find(t => t.id === state.id);
        const needsCredential = type ? type.credential !== null : credentialRef !== null;
        return { ...state, credentialState: needsCredential ? this.credentialState("api_key", credentialRef) : "not_required" as const };
      }),
      webProviderTypes: this.web.types(),
      ...this.modelCatalog(),
      modelProviderPresets: this.extensions.presets(), usageProviders: this.extensions.usageProviders(),
      tests: this.tests.snapshot(), discoveries: this.discoveries.snapshot(), credentialStorageAvailable: this.storageAvailable,
    };
  }
  private async perform(command: Exclude<ConfigurationCommand, { type: "model.parameters" }>): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "shell.set") { this.store.setShell(command.value); return null; }
    if (command.type === "sessionEntry.set") { this.store.selectSessionEntry(command.value); return null; }
    if (command.type === "webProvider.reorder") {
      this.store.reorderWebProviders(command.ids);
      return null;
    }
    if (command.type === "webProvider.save") {
      const { id, enabled } = command;
      const oldRef = this.store.get("webProvider", id)?.credentialRef ?? null;
      let ref = oldRef, newRef: string | null = null;
      try {
        if (command.credential.action === "clear") ref = null;
        else if (command.credential.action === "replace") {
          if (!this.storageAvailable) throw new Error("System credential protection is unavailable.");
          newRef = await this.vault.write(command.credential.value);
          ref = newRef;
        }
        this.assertOpen();
        this.store.save({ kind: "webProvider", id, value: { id, enabled }, credentialRef: ref });
      } catch (error) {
        if (newRef) this.removeCredential(newRef);
        if (error instanceof ConfigurationError) throw error;
        throw new ConfigurationError("unavailable", "The web provider could not be saved.");
      }
      if (oldRef && oldRef !== ref) this.removeCredential(oldRef);
      return id;
    }
    if (command.type === "test.start") return this.startTest(command.model);
    if (command.type === "test.cancel") { this.tests.cancel(command.id); return command.id; }
    if (command.type === "discovery.start") {
      const stored = this.store.get("modelProvider", command.providerId);
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
      const provider = this.store.get("modelProvider", discovery.providerId);
      if (!provider) throw new ConfigurationError("not_found", "The provider no longer exists.");
      if (discovery.state !== "succeeded")
        throw new ConfigurationError("invalid_request", "Model discovery has not succeeded.");
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
      this.tests.clear(command.kind, command.id);
      if (command.kind === "modelProvider") this.discoveries.clearProvider(command.id);
      if (credentialRef) this.removeCredential(credentialRef);
      return command.id;
    }
    if (command.id && !this.store.get(saveKinds[command.type as keyof typeof saveKinds], command.id)) throw new ConfigurationError("not_found", "This configuration no longer exists. Reload settings.");
    switch (command.type) {
      case "model.save":
        if (!this.store.get("modelProvider", command.value.providerId)) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
        this.store.save({ kind: "model", id: command.id, value: command.value });
        this.tests.clear("model", command.id ?? modelReference(command.value));
        return modelReference(command.value);
      case "modelProvider.save": break;
    }
    const id = command.value.id;
    const oldRef = command.id ? this.store.get("modelProvider", command.id)?.credentialRef ?? null : null;
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
      this.store.save({ kind: "modelProvider", id: command.id, value: command.value, credentialRef: ref });
      this.tests.clear("modelProvider", command.id ?? id);
    } catch (error) {
      if (newRef) this.removeCredential(newRef);
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError("unavailable", "The connection could not be saved. Check system credential protection and local storage.");
    }
    if (oldRef && oldRef !== ref) this.removeCredential(oldRef);
    return id;
  }
  private credentialState(auth: "api_key" | "none", ref: string | null): ModelProvider["credentialState"] {
    return auth === "none" ? "not_required" : !ref || !this.vault.exists(ref) ? "missing"
      : !this.storageAvailable ? "storage_unavailable" : this.vault.failures.has(ref) ? "decryption_failed" : "available";
  }
  private removeCredential(ref: string): void {
    try { this.vault.remove(ref); }
    catch { console.error("Unreferenced encrypted credential cleanup failed."); }
  }
  private startTest(modelId: string): string {
    const resolved = resolveProviderModel(this.modelCatalog(), modelId);
    if (!resolved) throw new ConfigurationError("not_found", "The model or provider no longer exists or is disabled. Reload settings.");
    const { model, provider } = resolved;
    const reference = this.store.get("modelProvider", provider.id)!.credentialRef;
    return this.tests.start(provider, model, async () => {
      if (!reference || !this.storageAvailable) throw new Error("Credential is unavailable.");
      return this.vault.read(reference);
    });
  }
  close(): void {
    this.closed = true;
    this.shutdown.abort();
    this.discoveries.close();
    this.providerListeners.clear();
    this.tests.close();
  }
}
