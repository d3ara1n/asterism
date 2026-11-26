import { configurationCommandSchema, createModelInput, modelReference, modelProviderComplete, resolveLanguageModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ModelProvider, type ModelParameterUpdate } from "../shared/configuration.ts";
import type { ModelCredential } from "@asterism-app/sdk/contracts";
import type { CredentialProtection } from "../shared/credential-protection.ts";
import { ModelOAuth } from "./oauth.ts";
import { ConfigurationError } from "./errors.ts";
import { ConfigurationStore, type StoredModelProvider } from "./store.ts";
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

const saveKinds = { "languageModelProvider.save": "languageModelProvider", "languageModel.save": "languageModel" } as const;

interface ConfigurationOptions {
  probe?: ConnectionProbe;
  testTimeoutMs?: number;
  discover?: DiscoverModels;
  catalog?: LoadModelCatalog;
  credentialProtection?: CredentialProtection;
}

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
  private readonly oauth: ModelOAuth;
  private readonly catalog: LoadModelCatalog;
  constructor(root: string, private readonly onChanged: () => void = () => {}, options: ConfigurationOptions = {}) {
    const { probe = runConnectionProbe, testTimeoutMs = 30_000, discover = discoverModels, catalog = loadModelCatalog, credentialProtection } = options;
    this.store = new ConfigurationStore(root);
    this.oauth = new ModelOAuth(root, credentialProtection, this.shutdown.signal);
    this.resolver = new CredentialResolver(this.shutdown.signal);
    this.discoveries = new ModelDiscoveries(onChanged, discover, testTimeoutMs);
    this.tests = new ModelConnectionTests(onChanged, probe, testTimeoutMs);
    this.catalog = catalog;
  }
  execute(raw: unknown): Promise<{ snapshot: ConfigurationSnapshot; savedId: string | null; parameterUpdate?: ModelParameterUpdate; authorizationUrl?: string }> {
    const parsed = configurationCommandSchema.safeParse(raw);
    if (!parsed.success) return Promise.reject(new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values."));
    if (parsed.data.type === "languageModel.parameters") return this.fetchParameters(parsed.data.modelId);
    const command = parsed.data;
    if (command.type === "languageModelProvider.oauth.start" || command.type === "languageModelProvider.oauth.finish"
        || command.type === "languageModelProvider.oauth.cancel") return this.authorize(command);
    return this.enqueue(async () => {
      this.assertOpen();
      const savedId = await this.perform(command);
      if (command.type === "languageModelProvider.save" || command.type === "remove" && command.kind === "languageModelProvider") this.providersChanged();
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
  private async authorize(command: Extract<ConfigurationCommand, { type: `languageModelProvider.oauth.${string}` }>) {
    this.assertOpen();
    let authorizationUrl: string | undefined;
    if (command.type === "languageModelProvider.oauth.start") {
      const previous = command.connectionId ? this.store.get("languageModelProvider", command.connectionId) : null;
      authorizationUrl = await this.oauth.start(command.id, command.provider, command.connectionId,
        previous?.oauthProvider === command.provider ? previous.oauthGrant : undefined);
    } else if (command.type === "languageModelProvider.oauth.finish") await this.oauth.finish(command.id);
    else this.oauth.cancel(command.id);
    return { snapshot: this.snapshot(), savedId: null, ...(authorizationUrl && { authorizationUrl }) };
  }
  executionCredential(providerId: string, signal?: AbortSignal): Promise<ModelCredential> {
    this.assertOpen();
    const provider = this.store.get("languageModelProvider", providerId);
    if (!provider) throw new ConfigurationError("not_found", "The provider no longer exists.");
    return this.providerCredential(provider, signal);
  }
  private async providerCredential(provider: StoredModelProvider, signal?: AbortSignal): Promise<ModelCredential> {
    if (provider.auth === "none") return { kind: "none" };
    if (provider.auth === "api_key" && provider.apiKey) return { kind: "api_key", key: await this.resolver.resolve(provider.apiKey, signal) };
    if (provider.auth === "oauth" && provider.oauthProvider && provider.oauthGrant && !provider.oauthInvalid) {
      const accessToken = await this.oauth.access(provider.oauthProvider, provider.oauthGrant, (next, invalid) => {
        const current = this.store.get("languageModelProvider", provider.id);
        if (this.closed || !current || current.oauthGrant !== provider.oauthGrant) return;
        this.store.save({ kind: "languageModelProvider", id: provider.id, value: { ...current, oauthGrant: next, oauthInvalid: invalid || undefined } });
        if (invalid) { this.providersChanged(); this.onChanged(); }
      }, signal);
      return { kind: "oauth", provider: provider.oauthProvider, accessToken };
    }
    throw new ConfigurationError("unavailable", "The provider credential is unavailable.");
  }
  languageModelProviders(): Omit<ModelProvider, "apiKey">[] {
    this.assertOpen();
    return this.store.list("languageModelProvider").map(({ apiKey: _key, oauthGrant: _grant, oauthInvalid: _invalid, ...value }) => value);
  }
  languageModelCatalog(): Pick<ConfigurationSnapshot, "languageModelProviders" | "languageModels"> {
    this.assertOpen();
    return { languageModelProviders: this.store.list("languageModelProvider").map(({ oauthGrant, oauthInvalid, ...provider }) => ({ ...provider,
      ...(provider.auth === "oauth" && { oauthState: oauthInvalid ? "reauthorize" as const : oauthGrant ? "connected" as const : "disconnected" as const }),
    })), languageModels: this.store.list("languageModel") };
  }
  private snapshot(): ConfigurationSnapshot {
    const runtime = this.messaging.connections();
    return {
      mcp: this.store.mcp(),
      shell: this.store.shell(),
      sessionEntry: this.store.sessionEntry(),
      sessionLifecycle: this.store.sessionLifecycle(),
      showUsage: this.store.showUsage(),
      usageBudget: this.store.usageBudget(),
      messagingProviderTypes: this.messaging.types(),
      messagingConnections: this.store.list("messaging").map(state => ({ ...state, runtime: runtime.find(connection => connection.id === state.id)! })),
      webProviders: this.store.list("webProvider"),
      webProviderTypes: this.web.types(),
      ...this.languageModelCatalog(),
      languageModelProviderPresets: this.extensions.presets(), usageProviders: this.extensions.usageProviders(),
      tests: this.tests.snapshot(), discoveries: this.discoveries.snapshot(),
    };
  }
  private async perform(command: Exclude<ConfigurationCommand, { type: "languageModel.parameters" | `languageModelProvider.oauth.${string}` }>): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "messaging.save") return this.saveMessaging(command);
    if (command.type === "messaging.restart") { this.messaging.restart(command.id); return command.id; }
    if (command.type === "shell.set") { this.store.setShell(command.value); return null; }
    if (command.type === "sessionLifecycle.set") { this.store.setSessionLifecycle(command.value); return null; }
    if (command.type === "showUsage.set") { this.store.setShowUsage(command.value); return null; }
    if (command.type === "usageBudget.set") { this.store.setUsageBudget(command.value); return null; }
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
    if (command.type === "languageModel.test.start") return this.startTest(command.model);
    if (command.type === "languageModel.test.cancel") { this.tests.cancel(command.id); return command.id; }
    if (command.type === "languageModel.discovery.start") {
      const stored = this.store.get("languageModelProvider", command.providerId);
      if (!stored) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
      return this.discoveries.start(stored, signal => this.providerCredential(stored, signal));
    }
    if (command.type === "languageModel.discovery.cancel") { this.discoveries.cancel(command.id); return command.id; }
    if (command.type === "languageModel.discovery.add") {
      const discovery = this.discoveries.get(command.id);
      const provider = this.store.get("languageModelProvider", discovery.providerId);
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
      if (command.kind === "languageModelProvider") this.discoveries.clearProvider(command.id);
      if (connection) this.messaging.remove(connection.id, connection.providerId);
      return command.id;
    }
    if (command.id && !this.store.get(saveKinds[command.type as keyof typeof saveKinds], command.id)) throw new ConfigurationError("not_found", "This configuration no longer exists. Reload settings.");
    switch (command.type) {
      case "languageModel.save":
        if (!this.store.get("languageModelProvider", command.value.providerId)) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
        this.store.save({ kind: "languageModel", id: command.id, value: command.value });
        this.tests.clear("languageModel", command.id ?? modelReference(command.value));
        return modelReference(command.value);
      case "languageModelProvider.save": break;
    }
    const previous = command.id ? this.store.get("languageModelProvider", command.id) : null;
    const value: StoredModelProvider = { ...command.value };
    if (!modelProviderComplete(value)) throw new ConfigurationError("invalid_request", "An API key is required for API key authentication.");
    if (value.auth === "oauth") {
      if (!value.oauthProvider) throw new ConfigurationError("invalid_request", "Select an OAuth provider.");
      if (command.authorization) value.oauthGrant = await this.oauth.savedValue(command.authorization, value.oauthProvider, command.id);
      else if (command.authorization !== null && previous?.oauthProvider === value.oauthProvider) {
        value.oauthGrant = previous.oauthGrant;
        value.oauthInvalid = previous.oauthInvalid;
      }
      if (!previous && !value.oauthGrant) throw new ConfigurationError("invalid_request", "Connect the account before saving.");
    } else delete value.oauthProvider;
    if (value.auth !== "api_key") value.apiKey = "";
    this.store.save({ kind: "languageModelProvider", id: command.id, value });
    if (command.authorization) this.oauth.cancel(command.authorization);
    this.tests.clear("languageModelProvider", command.id ?? value.id);
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
    const resolved = resolveLanguageModel(this.languageModelCatalog(), modelId);
    if (!resolved) throw new ConfigurationError("not_found", "The model or provider no longer exists or is disabled. Reload settings.");
    const { model, provider } = resolved;
    const stored = this.store.get("languageModelProvider", provider.id)!;
    return this.tests.start(provider, model, signal => this.providerCredential(stored, signal));
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
