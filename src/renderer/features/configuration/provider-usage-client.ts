import type { ProviderUsageState } from "@atelier/sdk/contracts";
import type { RendererProviderUsage } from "@atelier/sdk/renderer";
import type { ConfigurationBridge } from "../../../shared/configuration";

interface Entry { value: ProviderUsageState | null; listeners: Set<() => void>; generation: number; pending?: Promise<void>; timer?: ReturnType<typeof setTimeout> }
/** 全窗口共享的按连接订阅；多个卡片不各自建立轮询，后台窗口暂停刷新。 */
export class ProviderUsageClient implements RendererProviderUsage {
  private entries = new Map<string, Entry>();
  private active = true;
  private closed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: ConfigurationBridge, private readonly interval = 60_000) {
    this.unsubscribe = bridge.onChanged(() => {
      for (const [id, entry] of this.entries) {
        entry.generation++; entry.pending = undefined; entry.value = null;
        this.emit(entry);
        if (entry.listeners.size && this.active) void this.request(id, false);
      }
    });
  }
  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) { entry = { value: null, listeners: new Set(), generation: 0 }; this.entries.set(id, entry); }
    return entry;
  }
  get = (id: string) => this.entries.get(id)?.value ?? null;
  private emit(entry: Entry) { for (const listener of entry.listeners) listener(); }
  subscribe = (id: string, listener: () => void) => {
    const entry = this.entry(id);
    entry.listeners.add(listener);
    if (this.active) void this.request(id, false);
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size) { clearTimeout(entry.timer); entry.timer = undefined; }
    };
  };
  refresh = (id: string) => this.request(id, true);
  private request(id: string, refresh: boolean): Promise<void> {
    if (this.closed) return Promise.resolve();
    const entry = this.entry(id);
    if (entry.pending) return entry.pending;
    clearTimeout(entry.timer);
    const generation = ++entry.generation;
    if (entry.value?.usage) { entry.value = { ...entry.value, state: "loading" }; this.emit(entry); }
    const work = Promise.resolve().then(async () => {
      try {
        const result = await this.bridge.execute({ type: "usage.query", providerId: id, refresh });
        if (this.closed || entry.generation !== generation) return;
        if (!result.ok || !result.usage) throw new Error("Provider usage is unavailable.");
        entry.value = result.usage;
      } catch {
        if (this.closed || entry.generation !== generation) return;
        entry.value = { ...(entry.value ?? { providerId: id, revision: 0, usage: null, items: [], updatedAt: null }), state: "error", error: "unavailable" };
      } finally {
        if (!this.closed && entry.generation === generation) {
          entry.pending = undefined; this.emit(entry);
          if (entry.listeners.size && this.active && entry.value?.state !== "disabled")
            entry.timer = setTimeout(() => { void this.request(id, false); }, this.interval);
        }
      }
    });
    entry.pending = work;
    return work;
  }
  setActive(active: boolean): void {
    if (this.active === active || this.closed) return;
    this.active = active;
    for (const [id, entry] of this.entries) {
      clearTimeout(entry.timer);
      if (active && entry.listeners.size) void this.request(id, false);
    }
  }
  close(): void {
    this.closed = true; this.unsubscribe();
    for (const entry of this.entries.values()) { clearTimeout(entry.timer); entry.generation++; entry.listeners.clear(); }
    this.entries.clear();
  }
}
