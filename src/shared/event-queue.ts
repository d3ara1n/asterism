import type { EventContract, Source, Json, SubscriptionEnd } from "@asterism/sdk/contracts";
import { EventSubscriptionState } from "./event-subscription.ts";

/** latest coalescing key: values with the same origin and snapshot key replace each other; occurrence contracts return an empty string and do not coalesce. */
export function eventKey(contract: EventContract, source: Source, data: Json): string {
  if (contract.semantics.kind !== "snapshot") return "";
  const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return JSON.stringify([source?.plugin ?? null, source?.resource?.sessionId ?? null, source?.resource?.id ?? null,
    contract.semantics.key.map(key => record[key] ?? null)]);
}

/** Pending queue for one subscription: asynchronous, ordered, serial consumer calls; latest replaces only undelivered values with the same key. */
export class EventQueue<T> extends EventSubscriptionState {
  private items = new Map<string | number, T>();
  private ordinal = 0;
  private running: Promise<void> | undefined;
  constructor(private readonly options: {
    latest: boolean;
    consume(item: T, signal: AbortSignal): void | Promise<void>;
    ended(end: SubscriptionEnd): void;
  }) {
    super(end => { this.items.clear(); options.ended(end); });
  }
  push(item: T, key: string): void {
    if (!this.active) return;
    const slot = this.options.latest ? key : ++this.ordinal;
    // Delete then insert so coalesced values occupy the newest position.
    this.items.delete(slot); this.items.set(slot, item);
    this.running ??= this.drain();
  }
  private async drain(): Promise<void> {
    await Promise.resolve();
    try {
      while (this.active && this.items.size) {
        const [slot, item] = this.items.entries().next().value!;
        this.items.delete(slot);
        await this.options.consume(item, this.signal);
      }
    } catch { this.end({ reason: "consumer_failed", message: "The event consumer failed." }); }
    finally { this.running = undefined; }
  }
  close(): void { this.end({ reason: "closed" }); }
  /** Wait for actual in-flight callback completion; cancellation does not mean completion. */
  async settle(): Promise<void> { await this.running; }
}
