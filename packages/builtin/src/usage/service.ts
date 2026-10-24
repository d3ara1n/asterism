import type { ModelResponse } from "@atelier/sdk/contracts";
import { UsageQueryError, type ModelProviderInfo, type ModelProviderServices, type UsageProviderServices } from "@atelier/sdk/runtime";
import type { ProviderUsageState } from "./contract.ts";

interface Entry { value: ProviderUsageState; attemptedAt: number; controller: AbortController; pending?: Promise<ProviderUsageState> }
/** 等待者取消不结束其他卡片共享的查询。 */
export function waitForUsage<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
/** 内置 Agent 的消费策略：共享查询、短期缓存、消费请求结果；宿主目录不持有这些状态。 */
export class UsageConsumer {
  private entries = new Map<string, Entry>();
  private closed = false;
  private readonly unsubscribe: (() => void)[];
  constructor(private readonly modelProviders: ModelProviderServices, private readonly usageProviders: UsageProviderServices,
    private readonly changed: (providerId: string | null) => void = () => {},
    private readonly timeout = 10_000, private readonly freshness = 60_000) {
    this.unsubscribe = [modelProviders.subscribe(() => this.clear()), usageProviders.subscribe(() => this.clear())];
  }
  private empty(id: string, connection: ModelProviderInfo | null, source?: "query" | "headers"): ProviderUsageState {
    return { providerId: id, usage: connection?.usage ?? null,
      ...(source && { source }), state: "disabled", items: [], updatedAt: null, error: null };
  }
  async query(id: string, options: { signal?: AbortSignal; refresh?: boolean } = {}): Promise<ProviderUsageState> {
    options.signal?.throwIfAborted();
    if (this.closed) throw new UsageQueryError("unavailable");
    const connection = this.modelProviders.get(id);
    const provider = connection?.usage ? this.usageProviders.get(connection.usage) : null;
    const empty = this.empty(id, connection, provider?.source ?? (provider ? "query" : undefined));
    if (!connection?.enabled || !connection.usage) return empty;
    if (!provider) return { ...empty, state: "error", error: "unavailable" };
    let entry = this.entries.get(id);
    if (provider.source === "headers") {
      if (!entry) {
        entry = { controller: new AbortController(), attemptedAt: 0, value: { ...empty, state: "waiting" } };
        this.entries.set(id, entry);
      }
      return structuredClone(entry.value);
    }
    if (entry?.pending) return structuredClone(await waitForUsage(entry.pending, options.signal));
    if (entry && !options.refresh && Date.now() - entry.attemptedAt < this.freshness) return structuredClone(entry.value);
    const controller = new AbortController();
    const current: Entry = { controller, attemptedAt: Date.now(),
      value: { ...(entry?.value ?? empty), usage: provider.id, source: "query" } };
    this.entries.set(id, current);
    current.pending = Promise.resolve().then(async () => {
      const timeout = AbortSignal.timeout(this.timeout);
      const signal = AbortSignal.any([controller.signal, timeout]);
      try {
        signal.throwIfAborted();
        let credential: string | null;
        try { credential = await waitForUsage(this.modelProviders.credential(connection.id, { signal }), signal); }
        catch { throw new UsageQueryError("credential"); }
        if (connection.auth === "api_key" && !credential) throw new UsageQueryError("credential");
        signal.throwIfAborted();
        const items = await waitForUsage(provider.query({ connection: { id, endpoint: connection.baseUrl }, credential, signal }), signal);
        current.value = { ...empty, state: "ready", items, updatedAt: Date.now() };
      } catch (error) {
        current.value = { ...current.value, state: "error", error: timeout.aborted ? "timeout"
          : controller.signal.aborted ? "unavailable" : error instanceof UsageQueryError ? error.code : "network" };
      } finally { current.pending = undefined; }
      return current.value;
    });
    return structuredClone(await waitForUsage(current.pending, options.signal));
  }
  /** 发起调用的 Agent 取得结果后，显式交付自己的响应元信息。 */
  consume(response: ModelResponse): void {
    if (this.closed) return;
    const connection = this.modelProviders.get(response.connection.id);
    if (!connection?.enabled) return;
    const provider = connection.usage ? this.usageProviders.get(connection.usage) : null;
    if (provider?.source !== "headers") return;
    const previous = this.entries.get(connection.id);
    const value = { ...(previous?.value ?? this.empty(connection.id, connection, "headers")),
      usage: provider.id, source: "headers" as const };
    let next: ProviderUsageState;
    try {
      const items = provider.parseHeaders({ connection: { id: connection.id, endpoint: response.endpoint },
        model: response.model, status: response.status, receivedAt: response.receivedAt, headers: response.headers });
      if (items === null) return;
      next = { ...value, model: response.model, state: "ready", items, updatedAt: response.receivedAt, error: null };
    } catch (error) {
      next = { ...value, state: "error", error: error instanceof UsageQueryError ? error.code : "protocol" };
    }
    this.entries.set(connection.id, { value: next, attemptedAt: response.receivedAt, controller: previous?.controller ?? new AbortController() });
    this.changed(connection.id);
  }
  private clear() {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
    if (!this.closed) this.changed(null);
  }
  close(): void { this.closed = true; for (const unsubscribe of this.unsubscribe) unsubscribe(); this.clear(); }
}
