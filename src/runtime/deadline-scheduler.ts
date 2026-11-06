import { PluginApiError, type DeadlineServices } from "@asterism-app/sdk/runtime";

/** Node converts larger delays to 1 ms; long absolute waits need intermediate rechecks. */
const maxTimeoutMs = 2_147_483_647;

export function planDeadlineWakeup<T extends { at: number }>(entries: Iterable<T>, now: number): {
  due: T[]; nextAt: number | null; delayMs: number | null;
} {
  const due: T[] = [];
  let nextAt: number | null = null;
  for (const entry of entries) {
    if (entry.at <= now) due.push(entry);
    if (nextAt === null || entry.at < nextAt) nextAt = entry.at;
  }
  return { due, nextAt, delayMs: nextAt === null ? null : Math.max(1, Math.min(maxTimeoutMs, nextAt - now)) };
}

interface Deadline {
  at: number;
  callback: () => void | Promise<void>;
  release(): void;
}

/** One native timeout for all pending absolute deadlines; persistence and occurrence policy belong to callers. */
export class DeadlineScheduler implements DeadlineServices {
  private readonly entries = new Set<Deadline>();
  private clock: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(private readonly failed: (error: unknown) => void) {}

  schedule(at: number, callback: () => void | Promise<void>, options?: { signal?: AbortSignal }): () => void {
    if (this.closed) throw new PluginApiError("unavailable", "The deadline scheduler is closed.");
    if (!Number.isFinite(at)) throw new PluginApiError("invalid_argument", "The deadline must be a finite Unix timestamp in milliseconds.");
    const signal = options?.signal;
    if (signal?.aborted) return () => {};
    const entry: Deadline = { at, callback, release: () => signal?.removeEventListener("abort", cancel) };
    const cancel = () => {
      if (!this.entries.delete(entry)) return;
      entry.release();
      this.rearm();
    };
    this.entries.add(entry);
    signal?.addEventListener("abort", cancel, { once: true });
    this.rearm();
    return cancel;
  }

  /** Re-read wall-clock time after a timeout or system resume, including backward clock changes. */
  recheck(): void {
    if (this.closed) return;
    this.clearClock();
    const { due } = planDeadlineWakeup(this.entries, Date.now());
    for (const entry of due) {
      // An earlier callback may cancel a sibling deadline or close the scheduler.
      if (!this.entries.delete(entry)) continue;
      entry.release();
      try { Promise.resolve(entry.callback()).catch(error => this.failed(error)); }
      catch (error) { this.failed(error); }
    }
    this.rearm();
  }

  close(): void {
    this.closed = true;
    this.clearClock();
    for (const entry of this.entries) entry.release();
    this.entries.clear();
  }

  private clearClock(): void {
    if (this.clock !== undefined) clearTimeout(this.clock);
    this.clock = undefined;
  }

  private rearm(): void {
    this.clearClock();
    if (this.closed) return;
    const { delayMs } = planDeadlineWakeup(this.entries, Date.now());
    if (delayMs === null) return;
    this.clock = setTimeout(() => this.recheck(), delayMs);
    this.clock.unref();
  }
}
