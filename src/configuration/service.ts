import { configurationCommandSchema, createModelInput, modelReference, modelProviderComplete, resolveProviderModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ModelProvider, type ModelParameterUpdate } from "../shared/configuration.ts";
import { unauthenticatedApiKey } from "../shared/model.ts";
import { ConfigurationError } from "./errors.ts";
import { ConfigurationStore } from "./store.ts";
import { CredentialResolver } from "./credentials.ts";
import { runConnectionProbe, type ConnectionProbe } from "./probe.ts";
import { discoverModels, ModelDiscoveries, type DiscoverModels } from "./discovery.ts";
import { loadModelCatalog, modelParameters, type LoadModelCatalog } from "./model-catalog.ts";
import { modelCatalogMessages } from "../shared/model-catalog-messages.ts";
import { ModelProviderExtensions } from "./provider-extensions.ts";
import { ModelConnectionTests } from "./connection-tests.ts";
import { WebProviderRegistry } from "./web-providers.ts";
import { WebError, MessagingError } from "@asterism-app/sdk/runtime";
import { randomUUID } from "node:crypto";
import { MessagingRegistry } from "./messaging.ts";
import { validateProviderSettings } from "../shared/provider-settings.ts";

const saveKinds = { "modelProvider.save": "modelProvider", "model.save": "model" } as const;

export class ConfigurationService {
  readonly extensions = new ModelProviderExtensions();
  readonly messaging = new MessagingRegistry({
    list: () => this.store.list("messaging"),
    credential: async (value, signal) => {
      try { return await this.resolver.resolve(value, signal); }
      catch (error) { throw signal.aborted ? error : new MessagingError("unavailable", (error as Error).message); }
    },
    changed: () => { if (!this.closed) this.onChanged(); },
  });
  readonly web = new WebProviderRegistry({
    list: () => this.store.list("webProvider"),
    credential: async (value, signal) => {
      try { return await this.resolver.resolve(value, signal); }
      catch (error) { throw signal.aborted ? error : new WebError("credential_unavailable", (error as Error).message); }
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
  private readonly resolver: CredentialResolver;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly discoveries: ModelDiscoveries;
  private readonly shutdown = new AbortController();
  private readonly tests: ModelConnectionTests;
  constructor(root: string, private readonly onChanged: () => void = () => {},
    probe: ConnectionProbe = runConnectionProbe, testTimeoutMs = 30_000,
    discover: DiscoverModels = discoverModels, private readonly catalog: LoadModelCatalog = loadModelCatalog) {
    this.store = new ConfigurationStore(root);
    this.resolver = new CredentialResolver(this.shutdown.signal);
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
  private readonly mcpListeners = new Set<() => void>();
  mcpSettings() { this.assertOpen(); return this.store.mcp(); }
  mcpAuthorization(serverId: string) { this.assertOpen(); return this.store.mcpAuthorization(serverId); }
  setMcpAuthorization(serverId: string, value: Record<string, unknown> | null) {
    this.assertOpen();
    this.store.setMcpAuthorization(serverId, value);
  }
  /** Resolve a user-entered credential expression; see CredentialResolver for command semantics. */
  resolveCredential(value: string, signal?: AbortSignal): Promise<string> { return this.resolver.resolve(value, signal); }
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
  sessionLifecycle() { this.assertOpen(); return this.store.sessionLifecycle(); }
  shellSettings() { this.assertOpen(); return this.store.shell(); }
  current(): ConfigurationSnapshot { this.assertOpen(); return this.snapshot(); }
  async executionCredential(providerId: string, signal?: AbortSignal): Promise<string | null> {
    this.assertOpen();
    const provider = this.store.get("modelProvider", providerId);
    if (!provider) throw new ConfigurationError("not_found", "The provider no longer exists.");
    if (provider.auth === "none") return unauthenticatedApiKey;
    return provider.apiKey ? this.resolver.resolve(provider.apiKey, signal) : null;
  }
  /** Runtime consumers receive connections without their keys and read resolved credentials through executionCredential. */
  modelProviders(): Omit<ModelProvider, "apiKey">[] {
    this.assertOpen();
    return this.store.list("modelProvider").map(({ apiKey: _key, ...value }) => value);
  }
  modelCatalog(): Pick<ConfigurationSnapshot, "modelProviders" | "models"> {
    this.assertOpen();
    return { modelProviders: this.store.list("modelProvider"), models: this.store.list("model") };
  }
  private snapshot(): ConfigurationSnapshot {
    const runtime = this.messaging.connections();
    return {
      mcp: this.store.mcp(),
      shell: this.store.shell(),
      sessionEntry: this.store.sessionEntry(),
      sessionLifecycle: this.store.sessionLifecycle(),
      showUsage: this.store.showUsage(),
      messagingProviderTypes: this.messaging.types(),
      messagingConnections: this.store.list("messaging").map(state => ({ ...state, runtime: runtime.find(connection => connection.id === state.id)! })),
      webProviders: this.store.list("webProvider"),
      webProviderTypes: this.web.types(),
      ...this.modelCatalog(),
      modelProviderPresets: this.extensions.presets(), usageProviders: this.extensions.usageProviders(),
      tests: this.tests.snapshot(), discoveries: this.discoveries.snapshot(),
    };
  }
  private async perform(command: Exclude<ConfigurationCommand, { type: "model.parameters" }>): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "messaging.save") return this.saveMessaging(command);
    if (command.type === "messaging.restart") { this.messaging.restart(command.id); return command.id; }
    if (command.type === "shell.set") { this.store.setShell(command.value); return null; }
    if (command.type === "sessionLifecycle.set") { this.store.setSessionLifecycle(command.value); return null; }
    if (command.type === "showUsage.set") { this.store.setShowUsage(command.value); return null; }
    if (command.type === "sessionEntry.set") { this.store.selectSessionEntry(command.value); return null; }
    if (command.type === "webProvider.reorder") {
      this.store.reorderWebProviders(command.ids);
      return null;
    }
    if (command.type === "webProvider.save") {
      const { id, enabled } = command;
      const type = this.web.types().find(item => item.id === id);
      if (!type) throw new ConfigurationError("not_found", "This web provider type is unavailable.");
      // A saved provider is always usable: every required value is supplied.
      const settings = validateProviderSettings(type.settings, command.settings);
      if (!settings) throw new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values.");
      this.store.save({ kind: "webProvider", id, value: { id, enabled, settings } });
      return id;
    }
    if (command.type === "test.start") return this.startTest(command.model);
    if (command.type === "test.cancel") { this.tests.cancel(command.id); return command.id; }
    if (command.type === "discovery.start") {
      const stored = this.store.get("modelProvider", command.providerId);
      if (!stored) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
      return this.discoveries.start(stored, async signal => {
        if (stored.auth === "none") return "";
        if (!stored.apiKey) throw new Error("Credential is unavailable.");
        return this.resolver.resolve(stored.apiKey, signal);
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
      const connection = command.kind === "messaging" ? this.store.get("messaging", command.id) : null;
      this.store.remove(command.kind, command.id);
      if (command.kind !== "messaging") this.tests.clear(command.kind, command.id);
      if (command.kind === "modelProvider") this.discoveries.clearProvider(command.id);
      if (connection) this.messaging.remove(connection.id, connection.providerId);
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
    // Switching to unauthenticated access drops the saved key.
    const value = command.value.auth === "api_key" ? command.value : { ...command.value, apiKey: "" };
    if (!modelProviderComplete(value))
      throw new ConfigurationError("invalid_request", "An API key is required for API key authentication.");
    this.store.save({ kind: "modelProvider", id: command.id, value });
    this.tests.clear("modelProvider", command.id ?? value.id);
    return value.id;
  }
  private async saveMessaging(command: Extract<ConfigurationCommand, { type: "messaging.save" }>): Promise<string> {
    const previous = command.id ? this.store.get("messaging", command.id) : null;
    if (command.id && !previous) throw new ConfigurationError("not_found", "This messaging connection no longer exists.");
    if (previous && previous.providerId !== command.value.providerId)
      throw new ConfigurationError("invalid_request", "A connection's provider cannot be changed.");
    const type = this.messaging.types().find(type => type.id === command.value.providerId);
    if (!type) throw new ConfigurationError("not_found", "This messaging provider is unavailable.");
    const settings = validateProviderSettings(type.settings, command.value.settings);
    if (!settings) throw new ConfigurationError("invalid_request", "Invalid messaging configuration.");
    const id = command.id ?? randomUUID();
    this.store.save({ kind: "messaging", id: command.id, value: { ...command.value, id, settings } });
    // The replacement generation reads the saved configuration; this command's snapshot reports its status.
    this.messaging.restart(id);
    return id;
  }
  private startTest(modelId: string): string {
    const resolved = resolveProviderModel(this.modelCatalog(), modelId);
    if (!resolved) throw new ConfigurationError("not_found", "The model or provider no longer exists or is disabled. Reload settings.");
    const { model, provider } = resolved;
    return this.tests.start(provider, model, async signal => {
      if (!provider.apiKey) throw new Error("Credential is unavailable.");
      return this.resolver.resolve(provider.apiKey, signal);
    });
  }
  close(): void {
    this.closed = true;
    this.messaging.close();
    this.shutdown.abort();
    this.discoveries.close();
    this.providerListeners.clear();
    this.tests.close();
  }
}
