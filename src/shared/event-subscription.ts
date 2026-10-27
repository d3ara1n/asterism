import type { EventSubscription, SubscriptionEnd } from "@asterism-app/sdk/contracts";

/** Shared subscription establishment, termination, and cancellation state; callers manage actual finalization of running work. */
export class EventSubscriptionState {
  readonly subscription: EventSubscription;
  readonly ready: Promise<void>;
  readonly closed: Promise<SubscriptionEnd>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private resolveClosed!: (end: SubscriptionEnd) => void;
  private phase: "pending" | "ready" | "closed" = "pending";
  private controller = new AbortController();
  private unbind: (() => void) | undefined;
  constructor(private readonly onEnd: (end: SubscriptionEnd) => void) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    void this.ready.catch(() => {});
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
    this.subscription = { ready: this.ready, closed: this.closed, close: () => this.end({ reason: "closed" }) };
  }
  get active(): boolean { return this.phase !== "closed"; }
  get signal(): AbortSignal { return this.controller.signal; }
  /** Bind after registering cleanup responsibility; already-cancelled signals use the same termination entry. */
  bind(signal?: AbortSignal): void {
    if (!this.active || !signal) return;
    this.unbind?.();
    const abort = () => this.end({ reason: "aborted" });
    this.unbind = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  }
  markReady(): void {
    if (this.phase !== "pending") return;
    this.phase = "ready"; this.resolveReady();
  }
  end(end: SubscriptionEnd): void {
    if (!this.active) return;
    this.phase = "closed"; this.unbind?.(); this.unbind = undefined;
    // Cancellation listeners are consumer code too; defer them to avoid reentry within the terminating caller's stack.
    queueMicrotask(() => this.controller.abort());
    this.onEnd(end);
    this.rejectReady(new Error(end.message ?? end.reason)); this.resolveClosed(end);
  }
}
