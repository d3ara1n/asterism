import type { StartupBridge, StartupState } from "../../shared/startup.ts";

export class StartupError extends Error {
  constructor(readonly failure: Extract<StartupState, { status: "failed" }>) { super(failure.detail); }
}

/** 先订阅再读取当前启动状态；重载页面同样能取得已经发生的失败。 */
export function waitForRuntime(bridge: StartupBridge, signal: AbortSignal, progress: (state: Extract<StartupState, { status: "starting" }>) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let finished = false;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true; stop(); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(signal.reason);
    const receive = (state: StartupState) => {
      if (finished) return;
      if (state.status === "failed") finish(new StartupError(state));
      else if (state.status === "ready") finish();
      else progress(state);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    stop = bridge.onChanged(receive);
    void bridge.get().then(receive, finish);
  });
}

/** 只限制启动等待；取消信号同时传给实际准备工作，等待结束时撤销监听。 */
export function awaitStartup<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
