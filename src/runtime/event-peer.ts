import type { EventQueue } from "../shared/event-queue.ts";
import type { EventControl, EventFrame } from "../shared/plugin-events.ts";
import { eventSubscriptionFailure, type EventBus, type EventPacket } from "../plugins/events.ts";

/** 一条受信 renderer 连接：逐条转发原始信封；latest 合并在接收端按同一契约进行。 */
export class EventPeer {
  private subscriptions = new Map<string, EventQueue<EventPacket>>();
  constructor(private readonly bus: EventBus, private readonly send: (frame: EventFrame) => void) {}
  receive(command: EventControl): void {
    if (command.type === "reset") { this.close(); return; }
    if (command.type === "close") { this.subscriptions.get(command.id)?.close(); return; }
    if (this.subscriptions.has(command.id)) return;
    try {
      const queue = this.bus.listen(this.bus.contract(command.contract), { source: command.source },
        packet => this.send({ type: "event", id: command.id, event: packet.wire }));
      this.subscriptions.set(command.id, queue);
      void queue.closed.then(end => {
        if (this.subscriptions.get(command.id) !== queue) return;
        this.subscriptions.delete(command.id);
        try { this.send({ type: "closed", id: command.id, end }); } catch { /* 连接已关闭。 */ }
      });
      this.send({ type: "ready", id: command.id });
    } catch (error) {
      try { this.send({ type: "closed", id: command.id, end: eventSubscriptionFailure(error) }); } catch { /* 连接已关闭。 */ }
    }
  }
  close(): void {
    const queues = [...this.subscriptions.values()];
    this.subscriptions.clear();
    for (const queue of queues) queue.end({ reason: "disconnected" });
  }
}
