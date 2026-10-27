import type { EventContract, Source, PluginEvents } from "@asterism-app/sdk/contracts";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import { EventSubscriptionState } from "../shared/event-subscription.ts";
import type { EventQueue } from "../shared/event-queue.ts";
import { eventSubscriptionFailure, type EventBus, type EventPacket } from "./events.ts";
import type { RunGroup } from "./lifecycle.ts";

/** Adapter between plugin assembly and the global bus: defer subscription establishment and delegate consumption to the existing run lifetime. */
export class PluginEventScope {
  private subscriptions = new Map<EventSubscriptionState, () => void>();
  private phase: "initializing" | "active" | "closed" = "initializing";
  readonly api: PluginEvents;
  constructor(private readonly bus: EventBus, owner: string, group: RunGroup) {
    this.api = {
      publish: (contract, data) => this.publish(contract, data, { plugin: owner, resource: null }),
      subscribe: (contract, options, handler) => {
        const { signal, ...deliveryOptions } = options;
        let queue: EventQueue<EventPacket> | undefined;
        const state = new EventSubscriptionState(end => {
          if (queue) queue.end(end);
          else this.subscriptions.delete(state);
        });
        // Deliver establishment failure through ready/closed without throwing, so other subscriptions can still be established during activate.
        const start = () => {
          if (!state.active) return;
          try {
            const running = queue = bus.listen(contract, deliveryOptions, (packet, signal) =>
              group.start(current => Promise.resolve(handler(packet.event as Parameters<typeof handler>[0], { signal: current })),
                { signal, affectsHistory: false }).done);
            void running.closed.then(async end => {
              state.end(end);
              await running.settle();
              this.subscriptions.delete(state);
            });
            state.markReady();
          } catch (error) { state.end(eventSubscriptionFailure(error)); }
        };
        this.subscriptions.set(state, start);
        if (this.phase === "closed") state.end({ reason: "unavailable" });
        else {
          state.bind(signal);
          if (this.phase === "active") start();
        }
        return state.subscription;
      },
    };
  }
  publish(contract: EventContract, data: unknown, source: Source): void {
    if (this.phase !== "active") throw new PluginApiError("unavailable", "Plugin events are not available.");
    this.bus.publish(contract, source, data);
  }
  activate(): void {
    if (this.phase !== "initializing") return;
    this.phase = "active";
    for (const start of this.subscriptions.values()) start();
  }
  stop(): void {
    this.phase = "closed";
    for (const state of this.subscriptions.keys()) state.end({ reason: "unavailable" });
  }
}
