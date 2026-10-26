import { PluginApiError, type Lifetime } from "@asterism/sdk/runtime";

/**
 * 宿主生命周期作用域：end 先中止 signal，再按登记逆序等待清理。
 * 插件级作用域随插件释放结束；对象作用域由宿主在对象离开当前集合、会话归档或退出时结束。
 */
export class LifetimeScope implements Lifetime {
  private readonly controller = new AbortController();
  private readonly stack = new AsyncDisposableStack();
  private ending?: Promise<void>;
  readonly signal: AbortSignal;
  constructor(private readonly log: (message: string, error: unknown) => void, parent?: AbortSignal) {
    this.signal = parent ? AbortSignal.any([parent, this.controller.signal]) : this.controller.signal;
  }
  defer(cleanup: () => void | Promise<void>): void {
    if (this.ending) throw new PluginApiError("unavailable", "The lifetime has ended.");
    // 单个清理失败只记录，其余清理照常执行。
    this.stack.defer(async () => {
      try { await cleanup(); } catch (error) { this.log("Lifetime cleanup failed.", error); }
    });
  }
  /** 只中止信号；清理仍等 end 执行，供调用方先收束在途运行。 */
  abort(): void { this.controller.abort(); }
  end(): Promise<void> {
    return this.ending ??= (async () => {
      this.controller.abort();
      await this.stack.disposeAsync();
    })();
  }
}
