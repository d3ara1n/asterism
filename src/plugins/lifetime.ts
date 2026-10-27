import { PluginApiError, type Lifetime } from "@asterism-app/sdk/runtime";

/**
 * Host lifetime scope: end first aborts the signal, then awaits cleanup in reverse registration order.
 * Plugin scopes end on plugin release; the host ends object scopes when objects leave the current set, sessions are archived, or the app exits.
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
    // Log individual cleanup failures and continue all remaining cleanup.
    this.stack.defer(async () => {
      try { await cleanup(); } catch (error) { this.log("Lifetime cleanup failed.", error); }
    });
  }
  /** Abort the signal only; cleanup waits for end so callers can finalize in-flight runs first. */
  abort(): void { this.controller.abort(); }
  end(): Promise<void> {
    return this.ending ??= (async () => {
      this.controller.abort();
      await this.stack.disposeAsync();
    })();
  }
}
