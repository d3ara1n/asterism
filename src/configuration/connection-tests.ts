import { randomUUID } from "node:crypto";
import { modelReference, type ConnectionTest, type ModelProvider, type ProviderModel } from "../shared/configuration.ts";
import type { ConfigurationKind } from "./store.ts";
import { ConfigurationError } from "./errors.ts";
import { classifyProbeError, type ConnectionProbe } from "./probe.ts";

/** Transient connection checks own their cancellation and results, independently of persisted configuration. */
export class ModelConnectionTests {
  private closed = false;
  private readonly tests = new Map<string, { value: ConnectionTest; controller: AbortController; timer: ReturnType<typeof setTimeout>; started: number }>();
  constructor(private readonly onChanged: () => void, private readonly probe: ConnectionProbe, private readonly testTimeoutMs: number) {}
  snapshot(): ConnectionTest[] { return [...this.tests.values()].map(test => ({ ...test.value })); }
  clear(kind: ConfigurationKind, id: string): void {
    for (const [key, test] of this.tests) {
      if (test.value.state !== "running" &&
          (kind === "modelProvider" && test.value.providerId === id || kind === "model" && test.value.model === id))
        this.tests.delete(key);
    }
  }
  start(provider: ModelProvider, model: ProviderModel, credential: () => Promise<string>): string {
    for (const [key, test] of this.tests) {
      if (this.tests.size < 50) break;
      if (test.value.state !== "running") this.tests.delete(key);
    }
    const id = randomUUID();
    const controller = new AbortController();
    const value: ConnectionTest = { id, providerId: provider.id, model: modelReference(model),
      state: "running", startedAt: new Date().toISOString(), durationMs: null, error: null, message: null };
    const timer = setTimeout(() => {
      this.finish(id, { state: "failed", error: "timeout", message: "The connection test timed out." });
      controller.abort();
    }, this.testTimeoutMs);
    this.tests.set(id, { value, controller, timer, started: performance.now() });
    // Capture configuration and credentials when testing is requested; later edits do not change this request.
    void this.run(id, provider, model, credential, controller.signal);
    return id;
  }
  private async run(id: string, provider: ModelProvider, model: ProviderModel, credential: () => Promise<string>, signal: AbortSignal): Promise<void> {
    let apiKey = "";
    if (provider.auth === "api_key") {
      try {
        apiKey = await credential();
      } catch {
        this.finish(id, { state: "failed", error: "credential", message: "The credential is missing or cannot be decrypted. Enter it again in settings." });
        return;
      }
    }
    if (signal.aborted || this.closed) return;
    try {
      await this.probe({ provider, model, apiKey, signal });
      this.finish(id, { state: "succeeded", error: null, message: "Connection succeeded." });
    } catch (error) {
      if (!signal.aborted) this.finish(id, { state: "failed", ...classifyProbeError(error) });
    }
  }
  private finish(id: string, result: Pick<ConnectionTest, "state" | "error" | "message">): void {
    const test = this.tests.get(id);
    if (!test || test.value.state !== "running" || this.closed) return;
    clearTimeout(test.timer);
    Object.assign(test.value, result, { durationMs: Math.round(performance.now() - test.started) });
    this.onChanged();
  }
  cancel(id: string): void {
    const test = this.tests.get(id);
    if (!test) throw new ConfigurationError("not_found", "This connection test is no longer available.");
    this.finish(id, { state: "cancelled", error: "cancelled", message: "Connection test cancelled." });
    test.controller.abort();
  }
  close(): void {
    this.closed = true;
    for (const test of this.tests.values()) { clearTimeout(test.timer); test.controller.abort(); }
  }
}
