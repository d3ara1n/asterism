import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCall } from "@asterism-app/sdk/contracts";
import { CallClient } from "./call-client.ts";
import { callControlSchema, callFrameSchema, type CallControl, type CallFrame } from "./plugin-calls.ts";

const contract = defineCall("test.calls/query", { scope: "object", input: z.null(), output: z.string() });
const object = { id: "agent", sessionId: "session", kind: "test.calls/agent" };

describe("Plugin call client", () => {
  // Settings pages have no ResourceRef; plugin-level calls must traverse real envelopes without fabricating objects.
  it("plugin-level calls deliver through object-free envelopes and decode results by contract", async () => {
    const query = defineCall("test.calls/global", { scope: "plugin", input: z.null(), output: z.string() });
    let receive!: (frame: CallFrame) => void;
    const client = new CallClient({
      onFrame: listener => { receive = listener; return () => {}; },
      send: raw => {
        const control = callControlSchema.parse(raw);
        if (control.type === "invoke") {
          expect(control.object).toBeUndefined();
          receive({ type: "result", id: control.id, data: "ready" });
        }
      },
    });
    try { expect(await client.invoke(query, null, {})).toBe("ready"); }
    finally { client.close(); }
  });
  // Cancellation/disconnection releases waits; late messages cannot complete other calls and sent mutations must not replay automatically.
  it("cancellation and disconnection reject matching waits, late results are not reused, and close releases listeners", async () => {
    const sent: CallControl[] = [];
    let receive: ((frame: CallFrame) => void) | undefined;
    const client = new CallClient({
      send: control => { sent.push(callControlSchema.parse(structuredClone(control))); },
      onFrame: listener => { receive = listener; return () => { receive = undefined; }; },
    });
    try {
      const controller = new AbortController();
      const first = client.invoke(contract, null, { object, signal: controller.signal });
      const rejected = expect(first).rejects.toThrow();
      const firstId = (sent[0] as Extract<CallControl, { type: "invoke" }>).id;
      controller.abort();
      await rejected;
      expect(sent[1]).toEqual({ type: "cancel", id: firstId });
      const second = client.invoke(contract, null, { object });
      const disconnected = expect(second).rejects.toThrow("connection");
      receive!(callFrameSchema.parse({ type: "result", id: firstId, data: "late" }));
      client.disconnect();
      await disconnected;
      expect(sent.filter(control => control.type === "invoke")).toHaveLength(2);
    } finally { client.close(); }
    expect(receive).toBeUndefined();
    expect(sent.at(-1)).toEqual({ type: "reset" });
  });
});
