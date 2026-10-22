import { type EventContract, type EventEnvelope, type EventHandler, type EventSubscriber,
  type EventSubscribeOptions, type EventSubscription, type Json, type SubscriptionEnd } from "@atelier/sdk/contracts";
import { deepFreeze } from "./immutable.ts";
import type { EventFrame } from "./plugin-events.ts";
import type { EventBridge } from "./connection.ts";
import { EventQueue, eventKey } from "./event-queue.ts";

interface Consumer { queue: EventQueue<EventEnvelope>; receive(event: EventEnvelope): void; end(end: SubscriptionEnd, notify: boolean): void }
/** 前端订阅端：按本地契约解码，latest 在本地合并；订阅不依赖 React 卡片挂载。 */
export class EventClient implements EventSubscriber {
  private consumers = new Map<string, Consumer>();
  private stopListening: () => void;
  private ended = false;
  constructor(private readonly bridge: EventBridge) {
    this.stopListening = bridge.onFrame((frame: EventFrame) => {
      const consumer = this.consumers.get(frame.id);
      if (!consumer) return;
      if (frame.type === "ready") consumer.queue.markReady();
      else if (frame.type === "closed") consumer.end(frame.end, false);
      else consumer.receive(frame.event);
    });
  }
  subscribe<I, D extends Json>(contract: EventContract<I, D>, options: EventSubscribeOptions, handler: EventHandler<NoInfer<D>>): EventSubscription {
    const id = crypto.randomUUID();
    let notifyClose = true;
    const queue = new EventQueue<EventEnvelope>({ latest: options.delivery === "latest",
      consume: (event, signal) => handler(event as EventEnvelope<D>, { signal }),
      ended: () => {
        this.consumers.delete(id);
        if (notifyClose) { try { this.bridge.send({ type: "close", id }); } catch { /* 连接已关闭。 */ } }
      } });
    const end = (reason: SubscriptionEnd, notify: boolean) => { notifyClose = notify; queue.end(reason); };
    const consumer: Consumer = { queue, end, receive: event => {
      try {
        const data = contract.schema.parse(event.data) as Json;
        queue.push(deepFreeze({ ...event, data }), eventKey(contract, event.source, data));
      } catch { end({ reason: "consumer_failed", message: "The event could not be decoded." }, true); }
    } };
    if (this.ended) end({ reason: "disconnected" }, false);
    else if (options.delivery === "latest" && contract.semantics.kind !== "snapshot") end({ reason: "invalid_contract" }, false);
    else {
      this.consumers.set(id, consumer);
      queue.bind(options.signal);
      if (queue.active) {
        try { this.bridge.send({ type: "subscribe", id, contract: contract.id, source: options.source }); }
        catch { end({ reason: "disconnected" }, false); }
      }
    }
    return queue.subscription;
  }
  /** 断连终止旧订阅；运行时恢复后允许显式建立新订阅，不自动补发。 */
  disconnect(): void { for (const consumer of [...this.consumers.values()]) consumer.end({ reason: "disconnected" }, false); }
  close(): void {
    if (this.ended) return;
    this.ended = true; this.disconnect(); this.stopListening();
    try { this.bridge.send({ type: "reset" }); } catch { /* 连接已关闭。 */ }
  }
}
