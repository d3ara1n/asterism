import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCall } from "@atelier/sdk/contracts";
import { CallClient } from "./call-client.ts";
import { callControlSchema, callFrameSchema, type CallControl, type CallFrame } from "./plugin-calls.ts";

const contract = defineCall("test.calls/query", { scope: "object", input: z.null(), output: z.string() });
const object = { id: "agent", sessionId: "session", kind: "test.calls/agent" };

describe("插件调用客户端", () => {
  // 设置页没有 ResourceRef，插件级调用必须完整通过正式信封而不伪造对象。
  it("插件级调用通过无对象信封交付并按契约解码结果", async () => {
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
  // 取消/断连必须释放等待；迟到消息不得完成另一调用，已发送的修改不能自动重放。
  it("取消和断连拒绝对应等待，迟到结果不复用，关闭释放监听", async () => {
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
