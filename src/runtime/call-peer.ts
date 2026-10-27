import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { CallRegistry } from "../plugins/calls.ts";
import type { CallControl, CallFrame } from "../shared/plugin-calls.ts";

/** Call lifetime for one desktop connection; disconnect cancels handlers without cancelling independent business waits they reference. */
export class CallPeer {
  private pending = new Map<string, AbortController>();
  private closed = false;
  constructor(private readonly calls: CallRegistry, private readonly send: (frame: CallFrame) => void) {}
  receive(control: CallControl) {
    if (control.type === "reset") { this.reset(); return; }
    if (control.type === "cancel") { this.pending.get(control.id)?.abort(); return; }
    if (this.closed) return;
    if (this.pending.has(control.id)) return;
    const controller = new AbortController();
    this.pending.set(control.id, controller);
    const deliver = (frame: CallFrame) => {
      if (this.pending.get(control.id) !== controller) return;
      this.pending.delete(control.id);
      this.send(frame);
    };
    void this.calls.invoke(control.contract, control.input, { object: control.object, signal: controller.signal }, null).then(
      data => deliver({ type: "result", id: control.id, data }),
      error => {
        if (!controller.signal.aborted && !(error instanceof PluginApiError)) console.error("Plugin call failed.", error);
        deliver({ type: "error", id: control.id,
          code: controller.signal.aborted ? "cancelled" : error instanceof PluginApiError ? error.code : "failed",
          message: error instanceof PluginApiError ? error.message : controller.signal.aborted ? "The call was cancelled." : "The plugin call failed." });
      },
    );
  }
  private reset() {
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
  }
  close() { this.closed = true; this.reset(); }
}
