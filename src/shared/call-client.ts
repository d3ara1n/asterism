import { jsonSchema, type CallContract, type CallOptions, type CallScope, type Json, type PluginCalls } from "@atelier/sdk/contracts";
import type { CallBridge } from "./plugin-calls.ts";

/** 请求与取消独立传输；不为进程内业务等待设置期限，不自动重放提交。 */
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
  async invoke<I extends Json, O extends Json, S extends CallScope>(contract: CallContract<I, O, S>, input: I, options: CallOptions<S>): Promise<O> {
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
        try { this.bridge.send({ type: "cancel", id }); } catch { /* 断连由当前请求报告。 */ }
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
    try { this.bridge.send({ type: "reset" }); } catch { /* 连接已关闭。 */ }
  }
}
