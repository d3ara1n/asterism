import type { ResourceRef } from "@atelier/sdk/contracts";
import { PluginApiError } from "@atelier/sdk/runtime";

type Kind = "task" | "action" | "model" | "prepare";
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
  activity(sessionId: string): string[] { return this.lifecycle.activity(sessionId, this); }
  stop(): void { this.stopped = true; this.lifecycle.stop(this); }
  async close(): Promise<void> { this.stop(); await this.lifecycle.settle(this); }
}
