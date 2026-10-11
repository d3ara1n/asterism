import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { describe, expect, it, vi } from "vitest";
import { protocolVersion } from "../shared/contracts.ts";
import { RuntimeHost } from "./runtime-host.ts";

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork } }));

describe("任务进程对象流入口", () => {
  it("拒绝无效信封，二进制视图与空帧保持原样交付", async () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-stream-"));
    let logClosed: Promise<void> | undefined;
    const child = Object.assign(new EventEmitter(), {
      stdout: { pipe(log: Writable) { logClosed = finished(log); } }, stderr: null, kill: vi.fn(),
      postMessage: vi.fn((message: { kind?: string }) => {
        if (message.kind === "shutdown") child.emit("exit", 0);
      }),
    });
    fork.mockReturnValue(child);
    const received = vi.fn();
    const host = new RuntimeHost(() => {}, undefined, undefined, received);
    try {
      const ready = host.start("unused-runtime.js", root);
      child.emit("message", { kind: "ready", version: protocolVersion });
      await ready;
      const data = structuredClone(new Uint8Array([9, 1, 2, 9]).subarray(1, 3));
      const frame = { kind: "object.stream", sessionId: "session", objectId: "resource", channel: "example.counter/updates", data };
      for (const invalid of [
        { ...frame, data: [1, 2] }, { ...frame, data: new ArrayBuffer(2) },
        { ...frame, sessionId: "" }, { ...frame, objectId: 5 },
        { ...frame, channel: null }, { ...frame, extra: true },
      ]) child.emit("message", invalid);
      expect(received).not.toHaveBeenCalled();
      child.emit("message", frame);
      expect(received).toHaveBeenCalledTimes(1);
      const delivered = received.mock.calls[0]![0];
      expect(delivered.data).toBe(data);
      expect([...delivered.data]).toEqual([1, 2]);
      child.emit("message", { ...frame, data: new Uint8Array() });
      expect(received).toHaveBeenCalledTimes(2);
    } finally {
      await host.stop();
      await logClosed;
      rmSync(root, { recursive: true, force: true });
      vi.clearAllMocks();
    }
  });
});
