import { randomUUID } from "node:crypto";
import { proxyResponseSchema } from "../shared/network.ts";

/** Proxy resolution shares the task process lifetime; shutdown rejects unfinished requests. */
export class ProxyClient {
  private readonly pending = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();
  private closed = false;
  constructor(private readonly send: (message: unknown) => void) {}

  resolve(url: string): Promise<string> {
    if (this.closed) return Promise.reject(new Error("Network proxy resolution has stopped."));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.send({ kind: "proxy.request", id, url }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  receive(raw: unknown): void {
    const parsed = proxyResponseSchema.safeParse(raw);
    if (!parsed.success) return;
    const pending = this.pending.get(parsed.data.id);
    if (!pending) return;
    this.pending.delete(parsed.data.id);
    if (parsed.data.ok) pending.resolve(parsed.data.value);
    else pending.reject(new Error(parsed.data.error));
  }

  close(): void {
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(new Error("Network proxy resolution has stopped."));
    this.pending.clear();
  }
}
