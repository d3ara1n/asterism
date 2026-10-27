import { jsonSchema, type CallContract, type CallOptions, type CallScope, type Json, type PluginCalls } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import type { CallBridge } from "./connection.ts";

/** Requests and cancellation travel independently; no deadlines for in-process business waits or automatic submission replay. */
export class CallClient implements PluginCalls {
  private pending = new Map<string, { resolve(value: Json): void; reject(error: Error): void }>();
  private stopListening: () => void;
  private closed = false;
  constructor(private readonly bridge: CallBridge) {
    this.stopListening = bridge.onFrame(frame => {
      const pending = this.pending.get(frame.id);
      if (frame.type === "result") pending?.resolve(frame.data);
      else pending?.reject(Object.assign(new Error(frame.message), { code: frame.code }));
    });
  }
  async invoke<Input extends z.ZodType<Json>, Output extends z.ZodType<Json>, S extends CallScope>(
    contract: CallContract<Input, Output, S>, input: NoInfer<z.input<Input>> & Json, options: CallOptions<NoInfer<S>>,
  ): Promise<z.output<Output>> {
    if (this.closed) throw new Error("The plugin connection is closed.");
    options.signal?.throwIfAborted();
    const id = crypto.randomUUID();
    const wire = jsonSchema.parse(input);
    return new Promise<Json>((resolve, reject) => {
      const finish = (work: () => void) => {
        if (!this.pending.delete(id)) return;
        options.signal?.removeEventListener("abort", abort);
        work();
      };
      const abort = () => {
        try { this.bridge.send({ type: "cancel", id }); } catch { /* The current request reports disconnection. */ }
        finish(() => reject(options.signal?.reason ?? new Error("The call was cancelled.")));
      };
      this.pending.set(id, { resolve: value => finish(() => resolve(value)), reject: error => finish(() => reject(error)) });
      options.signal?.addEventListener("abort", abort, { once: true });
      try { this.bridge.send({ type: "invoke", id, contract: contract.id, object: options.object, input: wire }); }
      catch { this.pending.get(id)?.reject(new Error("The plugin connection was lost.")); }
    }).then(value => contract.output.parse(value));
  }
  disconnect() {
    for (const pending of [...this.pending.values()]) pending.reject(new Error("The plugin connection was lost."));
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.disconnect(); this.stopListening();
    try { this.bridge.send({ type: "reset" }); } catch { /* The connection is closed. */ }
  }
}
