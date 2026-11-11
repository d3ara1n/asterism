export interface InspectorNotification { method: string; params: Record<string, unknown> }
interface Reply { id?: number; result?: unknown; error?: { code: number; message: string }; method?: string; params?: Record<string, unknown> }

/** Request identities belong to this connection; disconnect rejects every outstanding operation. */
export class InspectorRequests {
  private sequence = 0;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private ended: Error | undefined;
  notification?: (event: InspectorNotification) => void;
  private readonly send: (message: string) => void;
  constructor(send: (message: string) => void) { this.send = send; }

  post<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.ended) return Promise.reject(this.ended);
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      try { this.send(JSON.stringify({ id, method, params })); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  receive(message: string): void {
    const reply = JSON.parse(message) as Reply;
    if (reply.id !== undefined) {
      const request = this.pending.get(reply.id);
      if (!request) return;
      this.pending.delete(reply.id);
      if (reply.error) request.reject(new Error(`Inspector error ${reply.error.code}: ${reply.error.message}`));
      else request.resolve(reply.result);
    } else if (reply.method) this.notification?.({ method: reply.method, params: reply.params ?? {} });
  }

  end(error: Error): void {
    this.ended = error;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

export interface InspectorConnection {
  requests: InspectorRequests;
  closed: Promise<Error>;
  close(): void;
}

export async function connectInspector(port: number, signal: AbortSignal): Promise<InspectorConnection> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal });
  if (!response.ok) throw new Error(`Inspector discovery failed: HTTP ${response.status}.`);
  const targets = await response.json() as { type: string; webSocketDebuggerUrl: string }[];
  const nodes = targets.filter(target => target.type === "node");
  if (nodes.length !== 1) throw new Error(`Expected one Node inspector target on port ${port}; found ${nodes.length}.`);
  signal.throwIfAborted();
  const socket = new WebSocket(nodes[0]!.webSocketDebuggerUrl);
  const requests = new InspectorRequests(message => socket.send(message));
  let opened!: () => void, openingFailed!: (error: Error) => void, disconnected!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { opened = resolve; openingFailed = reject; });
  const closed = new Promise<Error>(resolve => { disconnected = resolve; });
  let ended = false;
  const end = (error: Error) => {
    if (ended) return;
    ended = true;
    signal.removeEventListener("abort", abort);
    requests.end(error);
    openingFailed(error);
    disconnected(error);
    if (socket.readyState !== WebSocket.CLOSED) socket.close();
  };
  const abort = () => end(new Error("Inspector collection was stopped."));
  socket.addEventListener("open", opened, { once: true });
  socket.addEventListener("error", () => end(new Error("Inspector WebSocket failed.")), { once: true });
  socket.addEventListener("close", event => end(new Error(`Inspector disconnected (code ${event.code}).`)), { once: true });
  socket.addEventListener("message", event => {
    try {
      if (typeof event.data !== "string") throw new Error("Inspector returned a non-text message.");
      requests.receive(event.data);
    } catch (error) { end(error instanceof Error ? error : new Error(String(error))); }
  });
  signal.addEventListener("abort", abort, { once: true });
  await ready;
  return { requests, closed, close: () => end(new Error("Inspector connection closed.")) };
}
