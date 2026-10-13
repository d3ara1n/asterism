import type { ResourceRef } from "@atelier/sdk/contracts";
import { PluginApiError } from "@atelier/sdk/runtime";

type Kind = "task" | "action" | "model" | "prepare" | "event";
export interface RunningWork<T> { readonly signal: AbortSignal; readonly done: Promise<T>; cancel(): void }
interface Entry { group: RunGroup; object?: ResourceRef; affectsHistory: boolean; cancel(): void; done: Promise<unknown> }
/** 一个插件的运行真值：所有执行方式共享登记、取消、等待与关闭门禁。 */
export class RunLifecycle {
  private entries = new Set<Entry>();
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
    // 调用时就捕获环境；去重和队列的延后由各自调度模块明确负责。
    try { Promise.resolve(run(signal)).then(resolve, reject); }
    catch (error) { reject(error); }
    if (object && entry.affectsHistory) this.changed(object.sessionId);
    return { signal, done, cancel };
  }
  activity(sessionId: string, group?: RunGroup): string[] {
    return [...new Set([...this.entries].flatMap(entry => entry.affectsHistory && entry.object?.sessionId === sessionId && (!group || entry.group === group) ? [entry.object.id] : []))];
  }
  stop(group?: RunGroup): void {
    if (!group) this.stopped = true;
    for (const entry of this.entries) if (!group || entry.group === group) entry.cancel();
  }
  async settle(group?: RunGroup): Promise<void> {
    await Promise.allSettled([...this.entries].filter(entry => !group || entry.group === group).map(entry => entry.done));
  }
  async close(): Promise<void> { this.stop(); await this.settle(); }
}
/** 执行方式只持自身调度规则，活动与收束委托同一个生命周期。 */
export class RunGroup {
  private stopped = false;
  constructor(private readonly lifecycle: RunLifecycle, readonly kind: Kind) {}
  get closed(): boolean { return this.stopped || this.lifecycle.closed; }
  start<T>(run: (signal: AbortSignal) => Promise<T>, options: { object?: ResourceRef; signal?: AbortSignal; timeoutMs?: number; affectsHistory?: boolean } = {}): RunningWork<T> {
    return this.lifecycle.start(this, run, options);
  }
  /** 拉取式流沿用运行登记；暂停消费时，关闭宿主也能关闭底层迭代器。 */
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
  activity(sessionId: string): string[] { return this.lifecycle.activity(sessionId, this); }
  stop(): void { this.stopped = true; this.lifecycle.stop(this); }
  async close(): Promise<void> { this.stop(); await this.lifecycle.settle(this); }
}
