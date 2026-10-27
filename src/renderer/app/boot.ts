import type { StartupBridge, StartupState } from "../../shared/startup.ts";

export class StartupError extends Error {
  constructor(readonly failure: Extract<StartupState, { status: "failed" }>) { super(failure.detail); }
}

/** Subscribe before reading the current startup state; reloading the page also retrieves failures that have already occurred. */
export function waitForRuntime(bridge: StartupBridge, signal: AbortSignal, progress: (state: Extract<StartupState, { status: "starting" }>) => void,
  readSignal: AbortSignal = signal): Promise<void> {
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
    void awaitStartup(bridge.get(), readSignal).then(receive, finish);
  });
}

/** Limits only the startup wait; the cancellation signal also reaches the actual preparation work, and listeners are removed when waiting ends. */
export function awaitStartup<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
