import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { expect, it, vi } from "vitest";
import type { MessagePortMain } from "electron";
import { protocolVersion } from "../shared/contracts.ts";
import { RuntimeHost } from "./runtime-host.ts";

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork } }));

function fakeChild() {
  let logClosed: Promise<void> | undefined;
  const child = Object.assign(new EventEmitter(), {
    stdout: { pipe(log: Writable) { logClosed = finished(log); } }, stderr: null, kill: vi.fn(),
    postMessage: vi.fn((message: { kind?: string }) => { if (message.kind === "shutdown") child.emit("exit", 0); }),
  });
  return { child, closed: () => logClosed };
}

// 端口交接契约：任务进程就绪前不交出端口（调用方据此通知 renderer 不可用）；就绪后端口随转移列表交给任务进程。
it("就绪前拒绝交接直连端口，就绪后随转移列表交给任务进程", async () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-connect-"));
  const { child, closed } = fakeChild();
  fork.mockReturnValue(child);
  const host = new RuntimeHost(() => {});
  const port = {} as MessagePortMain;
  try {
    const ready = host.start("unused-runtime.js", root);
    expect(host.connect("a", port)).toBe(false);
    expect(child.postMessage).not.toHaveBeenCalled();
    child.emit("message", { kind: "ready", version: protocolVersion });
    await ready;
    expect(host.connect("a", port)).toBe(true);
    expect(child.postMessage).toHaveBeenLastCalledWith({ kind: "connection.open", id: "a" }, [port]);
    host.disconnect("a");
    expect(child.postMessage).toHaveBeenLastCalledWith({ kind: "connection.close", id: "a" });
  } finally {
    await host.stop(); await closed(); rmSync(root, { recursive: true, force: true }); vi.clearAllMocks();
  }
});

