import type { ProviderUsageState } from "./contract.ts";

export interface UsageBridge {
  query(providerId: string, refresh: boolean): Promise<ProviderUsageState>;
  onChanged(listener: (providerId?: string) => void): () => void;
}

interface Entry { value: ProviderUsageState | null; listeners: Set<() => void>; reread: boolean; pending?: Promise<void>; timer?: ReturnType<typeof setTimeout> }
/** Per-connection subscriptions shared across the entire window; cards do not poll independently, and background windows pause refreshes. */
export class ProviderUsageClient {
  private entries = new Map<string, Entry>();
  private active = true;
  private closed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: UsageBridge, private readonly interval = 60_000) {
    this.unsubscribe = bridge.onChanged(providerId => {
      for (const [id, entry] of this.entries) {
        if (providerId && providerId !== id) continue;
        entry.value = null;
        this.emit(entry);
        if (entry.pending) entry.reread = true;
        else if (entry.listeners.size && this.active) void this.request(id, false);
      }
    });
  }
  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) { entry = { value: null, listeners: new Set(), reread: false }; this.entries.set(id, entry); }
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
    entry.reread = false;
    if (entry.value?.usage) { entry.value = { ...entry.value, state: "loading" }; this.emit(entry); }
    const work = Promise.resolve().then(async () => {
      try {
        const result = await this.bridge.query(id, refresh);
        if (this.closed) return;
        entry.value = result;
      } catch {
        if (this.closed) return;
        entry.value = { ...(entry.value ?? { providerId: id, usage: null, items: [], updatedAt: null }), state: "error", error: "unavailable" };
      } finally {
        if (!this.closed) {
          entry.pending = undefined; this.emit(entry);
          if (entry.listeners.size && this.active) {
            if (entry.reread) void this.request(id, false);
            else if (entry.value?.state !== "disabled" && entry.value?.source !== "headers")
              entry.timer = setTimeout(() => { void this.request(id, false); }, this.interval);
          }
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
  unavailable(): void {
    if (this.closed) return;
    for (const [id, entry] of this.entries) {
      entry.value = { ...(entry.value ?? { providerId: id, usage: null, items: [], updatedAt: null }),
        state: "error", error: "unavailable" };
      this.emit(entry);
    }
  }
  close(): void {
    this.closed = true; this.unsubscribe();
    for (const entry of this.entries.values()) { clearTimeout(entry.timer); entry.listeners.clear(); }
    this.entries.clear();
  }
}
