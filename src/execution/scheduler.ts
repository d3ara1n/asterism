/** One request shares a serial lane; parallel operations have no implicit dependencies. */
export class ToolScheduler {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(execution: "parallel" | "sequential", signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (execution === "parallel" || signal.aborted) return work();
    const previous = this.tail;
    const ready = new Promise<void>(resolve => {
      const proceed = () => {
        signal.removeEventListener("abort", proceed);
        resolve();
      };
      signal.addEventListener("abort", proceed, { once: true });
      void previous.then(proceed);
    });
    // The executor finalizes cancelled work immediately; later work still waits for the predecessor.
    const result = ready.then(work);
    this.tail = previous.then(() => result).catch(() => undefined);
    return result;
  }
}
