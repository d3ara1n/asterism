import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { MessagePortMain } from "electron";
import { protocolVersion } from "../shared/contracts.ts";
import { RuntimeHost } from "./runtime-host.ts";

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork } }));

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: null, stderr: null, kill: vi.fn(),
    postMessage: vi.fn((message: { kind?: string }) => { if (message.kind === "shutdown") child.emit("exit", 0); }),
  });
  return child;
}

// Port handoff contract: withhold ports until task readiness (callers notify the renderer of unavailability); transfer ports with the transfer list once ready.
it("rejects direct port handoff before readiness and transfers it to the task process with the transfer list afterward", async () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-connect-"));
  const child = fakeChild();
  fork.mockReturnValue(child);
  const host = new RuntimeHost(() => {});
  const port = {} as MessagePortMain;
  try {
    const ready = host.start("unused-runtime.js", root, [], join(root, "startup.json"));
    expect(host.connect("a", port)).toBe(false);
    expect(child.postMessage).not.toHaveBeenCalled();
    child.emit("message", { kind: "ready", version: protocolVersion });
    await ready;
    expect(host.connect("a", port)).toBe(true);
    expect(child.postMessage).toHaveBeenLastCalledWith({ kind: "connection.open", id: "a" }, [port]);
    host.disconnect("a");
    expect(child.postMessage).toHaveBeenLastCalledWith({ kind: "connection.close", id: "a" });
  } finally {
    await host.stop(); rmSync(root, { recursive: true, force: true }); vi.clearAllMocks();
  }
});

