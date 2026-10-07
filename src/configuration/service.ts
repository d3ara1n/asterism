import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { agentSchema, configurationCommandSchema, modelRoleSchema, modelSchema, providerSchema, resolveProviderModel,
  type ConfigurationCommand, type ConfigurationSnapshot, type ConnectionTest, type Provider, type ProviderModel } from "../shared/configuration.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import { ConfigurationError, ConfigurationRepository, type ConfigurationKind, type ConfigurationRow } from "./repository.ts";
import { CredentialVault } from "./credentials.ts";
import { classifyProbeError, runConnectionProbe, type ConnectionProbe } from "./probe.ts";

const data = (row: ConfigurationRow): Record<string, unknown> => ({ ...JSON.parse(row.data_json), id: row.id, revision: row.revision });
export class ConfigurationService {
  readonly repository: ConfigurationRepository;
  private vault: CredentialVault;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private storageAvailable = false;
  private tests = new Map<string, { value: ConnectionTest; controller: AbortController; timer: ReturnType<typeof setTimeout>; started: number }>();
  constructor(db: DatabaseSync, root: string, protector: SecretProtector, private readonly onChanged: () => void = () => {},
    private readonly probe: ConnectionProbe = runConnectionProbe, private readonly testTimeoutMs = 30_000) {
    this.repository = new ConfigurationRepository(db);
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
  async executionCredential(providerId: string, revision: number): Promise<string | null> {
    this.assertOpen();
    const row = this.repository.get("provider", providerId);
    if (!row || row.revision !== revision) throw new ConfigurationError("conflict", "The provider changed before execution started.");
    if (data(row).auth === "none") return "weft-no-auth";
    return row.credential_ref ? this.vault.read(row.credential_ref) : null;
  }
  private provider(row: ConfigurationRow): Provider {
    const stored = data(row);
    const ref = row.credential_ref;
    const credentialState = stored.auth === "none" ? "not_required" : !ref || !this.vault.exists(ref) ? "missing"
      : !this.storageAvailable ? "storage_unavailable" : this.vault.failures.has(ref) ? "decryption_failed" : "available";
    return providerSchema.parse({ ...stored, credentialState });
  }
  private snapshot(): ConfigurationSnapshot {
    return {
      providers: this.repository.list("provider").map(row => this.provider(row)),
      models: this.repository.list("model").map(row => modelSchema.parse(data(row))),
      roles: this.repository.list("role").map(row => modelRoleSchema.parse({ ...data(row), builtin: !!row.builtin })),
      agents: this.repository.list("agent").map(row => agentSchema.parse({ ...data(row), builtin: !!row.builtin })),
      tests: [...this.tests.values()].map(test => ({ ...test.value })), credentialStorageAvailable: this.storageAvailable,
    };
  }
  private async perform(command: ConfigurationCommand): Promise<string | null> {
    if (command.type === "read") return null;
    if (command.type === "test.start") return this.startTest(command.modelId);
    if (command.type === "test.cancel") { this.cancelTest(command.id); return command.id; }
    if (command.type === "remove") {
      const old = this.repository.remove(command.kind, command.id);
      if (old.credential_ref) this.removeCredential(old.credential_ref);
      return command.id;
    }
    const kind = command.type.split(".")[0] as ConfigurationKind;
    const id = command.id ?? randomUUID();
    const old = this.repository.get(kind, id);
    if (command.id && !old) throw new ConfigurationError("not_found", "This configuration no longer exists. Reload settings.");
    if (kind === "model") {
      const providerId = (command as Extract<ConfigurationCommand, { type: "model.save" }>).value.providerId;
      if (!this.repository.get("provider", providerId)) throw new ConfigurationError("not_found", "The provider no longer exists. Reload settings.");
    }
    if (command.type !== "provider.save") {
      this.repository.save(kind, id, command.value);
      return id;
    }
    let ref = old?.credential_ref ?? null;
    let newRef: string | null = null;
    try {
      if (command.value.auth === "none" || command.credential.action === "clear") ref = null;
      else if (command.credential.action === "replace") {
        if (!this.storageAvailable) throw new Error("System credential protection is unavailable.");
        newRef = await this.vault.write(command.credential.value);
        ref = newRef;
      }
      this.assertOpen();
      this.repository.save("provider", id, command.value, ref);
    } catch (error) {
      if (newRef) this.removeCredential(newRef);
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError("unavailable", "The connection could not be saved. Check system credential protection and local storage.");
    }
    if (old?.credential_ref && old.credential_ref !== ref) this.removeCredential(old.credential_ref);
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
    const providerRow = this.repository.get("provider", provider.id)!;
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
    void this.runTest(id, provider, model, providerRow.credential_ref, controller.signal);
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
