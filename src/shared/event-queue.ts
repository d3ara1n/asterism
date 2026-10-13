import type { EventContract, EventSource, Json, SubscriptionEnd } from "@atelier/sdk/contracts";
import { EventSubscriptionState } from "./event-subscription.ts";

/** latest 合并键：同来源、同 snapshot 键的值互相替换；occurrence 契约返回空串，不参与合并。 */
export function eventKey(contract: EventContract, source: EventSource, data: Json): string {
  if (contract.semantics.kind !== "snapshot") return "";
  const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return JSON.stringify([source.plugin, source.resource?.sessionId ?? null, source.resource?.id ?? null,
    contract.semantics.key.map(key => record[key] ?? null)]);
}

/** 单个订阅的待消费队列：异步、按序、串行调用消费者；latest 只替换尚未交付的同键值。 */
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
    // 删除再插入：合并后的值排在最新位置。
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
  /** 等待在途回调真正结束；取消不等于结束。 */
  async settle(): Promise<void> { await this.running; }
}
