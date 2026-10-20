import { usageItemsSchema, type ProviderUsageState } from "@atelier/sdk/contracts";
import { UsageQueryError } from "@atelier/sdk/runtime";
import type { ProviderInput } from "../shared/configuration.ts";
import { ProviderExtensions } from "./provider-extensions.ts";
import { validateProviderTransport } from "../model/provider.ts";

type Connection = ProviderInput & { revision: number };
interface Entry { value: ProviderUsageState; attemptedAt: number; controller: AbortController; pending?: Promise<ProviderUsageState> }
/** 等待者可取消；共享查询本身由连接失效、超时和提供方生命周期管理。 */
export function waitForUsage<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    // 即使已取消也先接管 work 的拒绝，避免已创建的异步工作成为未处理拒绝。
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export class ProviderUsageQueries {
  private entries = new Map<string, Entry>();
  private closed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly extensions: ProviderExtensions,
    private readonly connection: (id: string) => Connection | null,
    private readonly credential: (connection: Connection) => Promise<string | null>,
    private readonly timeout = 10_000, private readonly freshness = 60_000) {
    this.unsubscribe = extensions.subscribe(() => this.clear());
  }
  async query(id: string, options: { signal?: AbortSignal; refresh?: boolean } = {}): Promise<ProviderUsageState> {
    options.signal?.throwIfAborted();
    if (this.closed) throw new UsageQueryError("unavailable");
    const connection = this.connection(id);
    const usage = connection?.usage ?? null;
    const empty: ProviderUsageState = { providerId: id, revision: connection?.revision ?? 0, usage,
      state: "disabled", items: [], updatedAt: null, error: null };
    if (!connection || !connection.enabled || !usage) return empty;
    if (!this.extensions.has(usage)) return { ...empty, state: "error", error: "unavailable" };
    let entry = this.entries.get(id);
    if (entry && (entry.value.revision !== connection.revision || entry.value.usage !== usage)) {
      this.invalidate(id); entry = undefined;
    }
    if (entry?.pending) return structuredClone(await waitForUsage(entry.pending, options.signal));
    if (entry && !options.refresh && Date.now() - entry.attemptedAt < this.freshness) return structuredClone(entry.value);
    const controller = new AbortController();
    const current: Entry = { controller, attemptedAt: Date.now(), value: entry?.value ?? empty };
    this.entries.set(id, current);
    current.pending = Promise.resolve().then(async () => {
      const timeout = AbortSignal.timeout(this.timeout);
      const signal = AbortSignal.any([controller.signal, timeout]);
      try {
        signal.throwIfAborted();
        try { validateProviderTransport(connection); } catch { throw new UsageQueryError("unsupported"); }
        const credential = await waitForUsage(this.credential(connection), signal);
        if (connection.auth === "api_key" && !credential) throw new UsageQueryError("credential");
        signal.throwIfAborted();
        const raw = await waitForUsage(this.extensions.query(usage, {
          connection: { id, endpoint: connection.baseUrl }, credential, signal,
        }), signal);
        const parsed = usageItemsSchema.safeParse(raw);
        if (!parsed.success) throw new UsageQueryError("protocol");
        current.value = { ...empty, state: "ready", items: parsed.data, updatedAt: Date.now() };
      } catch (error) {
        current.value = { ...current.value, state: "error", error: timeout.aborted ? "timeout"
          : controller.signal.aborted ? "unavailable" : error instanceof UsageQueryError ? error.code : "network" };
      } finally { current.pending = undefined; }
      // 连接/凭据变更后的迟到结果不能交付旧账户数据。
      if (this.entries.get(id) !== current || this.connection(id)?.revision !== connection.revision)
        return { ...empty, state: "error", error: "unavailable" };
      return current.value;
    });
    return structuredClone(await waitForUsage(current.pending, options.signal));
  }
  invalidate(id: string): void { this.entries.get(id)?.controller.abort(); this.entries.delete(id); }
  private clear() { for (const entry of this.entries.values()) entry.controller.abort(); this.entries.clear(); }
  close(): void { this.closed = true; this.unsubscribe(); this.clear(); }
}
