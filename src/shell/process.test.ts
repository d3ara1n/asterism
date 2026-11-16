import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { startShellProcess } from "./process.ts";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function childProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 4242,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  vi.mocked(spawn).mockReturnValue(child as never);
  return child;
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

it.skipIf(process.platform === "win32")(
  "stops the remaining group after leader exit and drains already accepted callbacks",
  async () => {
    const child = childProcess();
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const entered = gate(),
      release = gate();
    const received: string[] = [];
    const running = startShellProcess("shell", [], {
      cwd: "/unused",
      env: {},
      async onData(_stream, bytes) {
        if (bytes.toString() === "first") {
          entered.resolve();
          await release.promise;
        }
        received.push(bytes.toString());
      },
    });
    child.stdout.emit("data", Buffer.from("first"));
    await entered.promise;
    child.stderr.emit("data", Buffer.from("second"));
    child.emit("exit", 0, null);
    await running.exited;
    // stop must not wait for onData: an onData failure also calls stop from this queue.
    await running.stop();
    expect(kill).toHaveBeenCalledWith(-4242, "SIGKILL");
    expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true);
    release.resolve();
    expect(await running.settled).toEqual({
      exitCode: 0,
      signal: null,
      error: null,
    });
    expect(received).toEqual(["first", "second"]);
  },
);

it.skipIf(process.platform === "win32")(
  "settles an output callback failure without awaiting its own callback queue",
  async () => {
    const child = childProcess();
    vi.spyOn(process, "kill").mockImplementation(() => {
      child.emit("exit", null, "SIGKILL");
      return true;
    });
    const running = startShellProcess("shell", [], {
      cwd: "/unused",
      env: {},
      async onData() {
        throw new Error("output write failed");
      },
    });
    child.stdout.emit("data", Buffer.from("data"));
    expect(await running.settled).toEqual({
      exitCode: null,
      signal: "SIGKILL",
      error: "output write failed",
    });
  },
);

it("settles ordinary foreground completion without stopping background processes", async () => {
  const child = childProcess();
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  const received: string[] = [];
  const running = startShellProcess("shell", [], {
    cwd: "/unused",
    env: {},
    async onData(_stream, bytes) {
      received.push(bytes.toString());
    },
  });
  child.stdout.emit("data", Buffer.from("complete"));
  child.emit("exit", 0, null);
  child.emit("close", 0, null);
  await running.settled;
  expect(received).toEqual(["complete"]);
  expect(kill).not.toHaveBeenCalled();
});

it.skipIf(process.platform === "win32")(
  "settles accepted output even when explicit group termination fails",
  async () => {
    const child = childProcess();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("termination failed");
    });
    const received: string[] = [];
    const running = startShellProcess("shell", [], {
      cwd: "/unused",
      env: {},
      async onData(_stream, bytes) {
        received.push(bytes.toString());
      },
    });
    child.stdout.emit("data", Buffer.from("accepted"));
    child.emit("exit", 0, null);
    await expect(running.stop()).rejects.toThrow("termination failed");
    await running.settled;
    expect(received).toEqual(["accepted"]);
    expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true);
  },
);
