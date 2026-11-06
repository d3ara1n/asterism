/** In-memory absolute deadlines; consumers own durable state and missed-occurrence behavior. */
export interface DeadlineServices {
  /**
   * Schedule one callback at a finite Unix timestamp in milliseconds. Overdue callbacks run asynchronously.
   * Wakeups recheck wall-clock time, including after system resume. Callback failures are logged.
   * Cancellation (the returned function or signal) removes a pending callback; it does not interrupt one already running.
   * Plugin callbacks are cancelled when the plugin lifetime ends. Pass an attachment lifetime's signal for resource-owned deadlines.
   */
  schedule(at: number, callback: () => void | Promise<void>, options?: { signal?: AbortSignal }): () => void;
}
