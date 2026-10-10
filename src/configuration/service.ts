import { randomUUID } from "node:crypto";
import { configurationCommandSchema, providerSchema, resolveProviderModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ConnectionTest, type Provider, type ProviderModel } from "../shared/configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import { ConfigurationError } from "./errors.ts";
import { ConfigurationStore, type StoredProvider } from "./store.ts";
import { CredentialVault } from "./credentials.ts";
import { classifyProbeError, runConnectionProbe, type ConnectionProbe } from "./probe.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";

const saveKinds = { "provider.save": "provider", "model.save": "model", "role.save": "role", "agent.save": "agent" } as const;

export class ConfigurationService {
  private readonly store: ConfigurationStore;
  private readonly vault: CredentialVault;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private storageAvailable = false;
  private tests = new Map<string, { value: ConnectionTest; controller: AbortController; timer: ReturnType<typeof setTimeout>; started: number }>();
  constructor(root: string, protector: SecretProtector, private readonly onChanged: () => void = () => {},
    private readonly probe: ConnectionProbe = runConnectionProbe, private readonly testTimeoutMs = 30_000) {
    this.store = new ConfigurationStore(root);
    this.vault = new CredentialVault(root, protector);
  }
  execute(raw: ConfigurationCommand): Promise<{ snapshot: ConfigurationSnapshot; savedId: string | null }> {
    const operation = this.queue.then(async () => {
      this.assertOpen();
      const parsed = configurationCommandSchema.safeParse(raw);
      if (!parsed.success) throw new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values.");
      this.storageAvailable = await this.vault.available();
      this.assertOpen();
      const savedId = await this.perform(parsed.data);
      return { snapshot: this.snapshot(), savedId };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  private assertOpen(): void { if (this.closed) throw new ConfigurationError("unavailable", "Configuration service is unavailable."); }
  agentConfiguration(id: string) {
    this.assertOpen();
    const agent = this.store.get("agent", id);
    return agent ? resolveAgentConfiguration(agent) : null;
  }
  async executionCredential(providerId: string, revision: number): Promise<string | null> {
    this.assertOpen();
    const provider = this.store.get("provider", providerId);
    if (!provider || provider.revision !== revision) throw new ConfigurationError("conflict", "The provider changed before execution started.");
    if (provider.auth === "none") return "weft-no-auth";
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
      models: this.store.list("model"),
      roles: roles.map(role => resolveRoleConfiguration(role)),
      agents: agents.map(agent => resolveAgentConfiguration(agent)),
      defaults: structuredClone(configurationDefaults),
      overrides: {
        roles: Object.fromEntries(roles.map(role => [role.id, role.overrides])),
        agents: Object.fromEntries(agents.map(agent => [agent.id, agent.overrides])),
      },
      tests: [...this.tests.values()].map(test => ({ ...test.value })), credentialStorageAvailable: this.storageAvailable,
    };
  }
  private async perform(command: ConfigurationCommand): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "test.start") return this.startTest(command.modelId);
    if (command.type === "test.cancel") { this.cancelTest(command.id); return command.id; }
    if (command.type === "remove") {
      const { credentialRef } = this.store.remove(command.kind, command.id);
      if (credentialRef) this.removeCredential(credentialRef);
      return command.id;
    }
    const id = command.id ?? randomUUID();
    if (command.id && !this.store.get(saveKinds[command.type], id)) throw new ConfigurationError("not_found", "This configuration no longer exists. Reload settings.");
    switch (command.type) {
      case "role.save": this.store.save({ kind: "role", id, value: command.value }); return id;
      case "agent.save": this.store.save({ kind: "agent", id, value: command.value }); return id;
      case "model.save":
        if (!this.store.get("provider", command.value.providerId)) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
        this.store.save({ kind: "model", id, value: command.value });
        return id;
      case "provider.save": break;
    }
    const oldRef = this.store.get("provider", id)?.credentialRef ?? null;
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
      this.store.save({ kind: "provider", id, value: command.value, credentialRef: ref });
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
    const value: ConnectionTest = { id, providerId: provider.id, providerRevision: provider.revision, modelId: model.id, modelRevision: model.revision,
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
    for (const test of this.tests.values()) { clearTimeout(test.timer); test.controller.abort(); }
  }
}
