import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { PluginApiError } from "@asterism-app/sdk/runtime";

type Kind = "task" | "action" | "model" | "prepare" | "event" | "call" | "tool";
export interface RunningWork<T> { readonly signal: AbortSignal; readonly done: Promise<T>; cancel(): void }
interface Entry { group: RunGroup; object?: ResourceRef; affectsHistory: boolean; cancel(): void; done: Promise<unknown> }
/** Runtime authority for one plugin: all execution modes share registration, cancellation, waiting, and the close gate. */
export class RunLifecycle {
  private entries = new Set<Entry>();
  private readonly controller = new AbortController();
  get signal(): AbortSignal { return this.controller.signal; }
  private stopped = false;
  constructor(private readonly changed: (sessionId: string) => void) {}
  group(kind: Kind): RunGroup { return new RunGroup(this, kind); }
  get closed(): boolean { return this.stopped; }
  start<T>(group: RunGroup, run: (signal: AbortSignal) => Promise<T>, options: { object?: ResourceRef; signal?: AbortSignal; timeoutMs?: number; affectsHistory?: boolean }): RunningWork<T> {
    if (this.stopped || group.closed) throw new PluginApiError("unavailable", "The plugin is closing.");
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const object = options.object ? Object.freeze({ ...options.object }) : undefined;
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new Error("Task timed out.")), options.timeoutMs);
    const cancel = () => controller.abort();
    const entry: Entry = { group, object, affectsHistory: options.affectsHistory !== false, cancel, done: Promise.resolve() };
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
    const done = completion.finally(() => {
      clearTimeout(timer); this.entries.delete(entry);
      if (object && entry.affectsHistory) this.changed(object.sessionId);
    });
    entry.done = done;
    this.entries.add(entry);
    // Capture the environment at invocation; individual scheduling modules explicitly own deduplication and queue delays.
    try { Promise.resolve(run(signal)).then(resolve, reject); }
    catch (error) { reject(error); }
    if (object && entry.affectsHistory) this.changed(object.sessionId);
    return { signal, done, cancel };
  }
  /** Aggregate only holds depending on the current timeline path; resources project their own business runtime state. */
  activity(sessionId: string, group?: RunGroup): { busy: string[] } {
    const busy = new Set<string>();
    for (const entry of this.entries) {
      if (!entry.affectsHistory || entry.object?.sessionId !== sessionId || (group && entry.group !== group)) continue;
      busy.add(entry.object.id);
    }
    return { busy: [...busy] };
  }
  stop(group?: RunGroup): void {
    if (!group) { this.stopped = true; this.controller.abort(); }
    for (const entry of this.entries) if (!group || entry.group === group) entry.cancel();
  }
  async settle(group?: RunGroup): Promise<void> {
    await Promise.allSettled([...this.entries].filter(entry => !group || entry.group === group).map(entry => entry.done));
  }
  /** Cancel matching work and wait for finalization; detachment stops owned producers before borrowed operations. */
  async cancel(match: (object: ResourceRef) => boolean, kinds?: readonly Kind[]): Promise<void> {
    const bound = [...this.entries].filter(entry => entry.object && match(entry.object) && (!kinds || kinds.includes(entry.group.kind)));
    for (const entry of bound) entry.cancel();
    await Promise.allSettled(bound.map(entry => entry.done));
  }
  async close(): Promise<void> { this.stop(); await this.settle(); }
}
/** Execution modes hold only their own scheduling rules; activities and finalization use the same lifetime. */
export class RunGroup {
  private stopped = false;
  constructor(private readonly lifecycle: RunLifecycle, readonly kind: Kind) {}
  get closed(): boolean { return this.stopped || this.lifecycle.closed; }
  start<T>(run: (signal: AbortSignal) => Promise<T>, options: { object?: ResourceRef; signal?: AbortSignal; timeoutMs?: number; affectsHistory?: boolean } = {}): RunningWork<T> {
    return this.lifecycle.start(this, run, options);
  }
  /** Pull streams reuse run registration; host close can also close the underlying iterator while consumption is paused. */
  iterate<T>(create: (signal: AbortSignal) => AsyncIterable<T>, signal: AbortSignal): AsyncIterable<T> {
    const group = this;
    let iterator: AsyncIterator<T> | undefined;
    return { [Symbol.asyncIterator]() {
      if (iterator) return iterator;
      let source: AsyncIterator<T> | undefined, work: RunningWork<void> | undefined;
      let finish: (() => void) | undefined, closing: Promise<void> | undefined, ended = false;
      const close = (): Promise<void> => closing ??= (async () => {
        ended = true;
        try { await source?.return?.(); }
        finally { finish?.(); }
      })();
      const start = () => {
        work ??= group.start(async current => {
          current.throwIfAborted();
          source = create(current)[Symbol.asyncIterator]();
          const completed = new Promise<void>(resolve => { finish = resolve; });
          const abort = () => { void close().catch(() => {}); };
          current.addEventListener("abort", abort, { once: true });
          try { if (current.aborted) abort(); await completed; }
          finally { current.removeEventListener("abort", abort); }
        }, { signal, affectsHistory: false });
      };
      return iterator = {
        async next() {
          if (ended) return { done: true as const, value: undefined };
          start();
          if (!source) { await work!.done; return { done: true as const, value: undefined }; }
          try {
            const value = await source.next();
            if (value.done) { ended = true; finish?.(); await work!.done; }
            return value;
          } catch (error) {
            try { await close(); } finally { await work!.done; }
            throw error;
          }
        },
        async return() {
          work?.cancel();
          await close();
          await work?.done;
          return { done: true as const, value: undefined };
        },
      };
    } };
  }
  activity(sessionId: string): string[] { return this.lifecycle.activity(sessionId, this).busy; }
  stop(): void { this.stopped = true; this.lifecycle.stop(this); }
  async close(): Promise<void> { this.stop(); await this.lifecycle.settle(this); }
}
