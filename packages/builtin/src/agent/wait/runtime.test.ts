import { describe, expect, it } from "vitest";
import type { ObjectExecutor } from "@asterism-app/sdk/runtime";
import { sessionSnapshot } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { createWaitTool } from "./runtime.ts";

function prepare(loop: Parameters<typeof createWaitTool>[0]) {
  const resource = { ref: { sessionId: "s", id: "worker", kind: "asterism.builtin/agent" }, title: "Worker", data: {} };
  // Waiting reads identity, the bound resource, and the current session; it uses no write capabilities.
  const object = { ref: resource.ref, snapshot: () => resource,
    session: { snapshot: () => sessionSnapshot(nodeView("s", "", [], null)) } } as unknown as ObjectExecutor;
  const invocation = createWaitTool(loop).prepare(resource, object, null, {}, {
    ref: { ...resource.ref, id: "caller" }, title: "Caller",
  }, false);
  if (!("execute" in invocation)) throw new Error("Wait preparation failed.");
  return invocation;
}

describe("Agent waits without a timeout", () => {
  it("keeps waiting when accepted input starts another loop before the Agent settles", async () => {
    let loops = 2;
    const invocation = prepare({
      running: () => loops > 0,
      settled: async () => { loops--; },
    });
    const result = await invocation.execute(new AbortController().signal);
    expect(loops).toBe(0);
    expect(result).toMatchObject({ kind: "succeeded", data: { name: "Worker", executionState: "empty" } });
  });

  it("cancels the wait without stopping the Agent", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    let running = true;
    const invocation = prepare({
      running: () => running,
      settled: async (_object, signal) => {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          started();
        });
        running = false;
      },
    });
    const result = invocation.execute(controller.signal);
    await waiting;
    const reason = new Error("The caller cancelled the wait.");
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(running).toBe(true);
  });

  it("preserves an unrelated settling failure when no deadline exists", async () => {
    const failure = new Error("The settling observation failed.");
    const invocation = prepare({ running: () => true, settled: async () => { throw failure; } });
    await expect(invocation.execute(new AbortController().signal)).rejects.toBe(failure);
  });
});
