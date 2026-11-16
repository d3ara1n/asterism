import { afterEach, expect, it, vi } from "vitest";
import { resolveShell } from "./profiles.ts";
import { startShellProcess, type ProcessExit } from "./process.ts";
import { ShellOutputBuffer } from "./output.ts";
import { ShellExecutor } from "./execution.ts";

vi.mock("./profiles.ts", () => ({ resolveShell: vi.fn() }));
vi.mock("./process.ts", () => ({ startShellProcess: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const exit: ProcessExit = { exitCode: 0, signal: null, error: null };
function setup() {
  const exited = gate<ProcessExit>(),
    settled = gate<ProcessExit>(),
    started = gate<void>();
  const stop = vi.fn(async () => {
    settled.resolve(exit);
  });
  vi.mocked(resolveShell).mockResolvedValue({
    executable: "/shell",
    profile: {
      id: "test",
      executable: "/shell",
      args: [],
      commandArgs: ["-c"],
      env: {},
    },
    env: {},
  });
  vi.mocked(startShellProcess).mockImplementation(
    (_executable, _args, options) => {
      // Accepted output precedes foreground exit; settlement is controlled independently.
      void options.onData("stdout", Buffer.from("retained"));
      started.resolve();
      return { exited: exited.promise, settled: settled.promise, stop };
    },
  );
  const executor = new ShellExecutor(
    () => ({ selected: "auto", profiles: [] }),
    new AbortController().signal,
  );
  return { executor, exited, settled, started, stop };
}

it("keeps cancellation active after foreground exit until output settles and reports uncertain effects", async () => {
  const { executor, exited, started, stop } = setup();
  const abort = new AbortController();
  const result = executor.execute(
    "/unused",
    { command: "command" },
    { signal: abort.signal, publish() {} },
  );
  await started.promise;
  exited.resolve(exit);
  // Resolving the foreground promise queues its continuation before this event gate resumes.
  await exited.promise;
  abort.abort();
  expect(await result).toMatchObject({
    kind: "unknown",
    data: { output: "retained", termination: "cancelled" },
  });
  expect(stop).toHaveBeenCalledOnce();
});

it("keeps cancellation active during final output flushing and waits for stop cleanup", async () => {
  const { executor, exited, settled, started, stop } = setup();
  const flushing = gate<void>(),
    releaseFlush = gate<void>(),
    cleanup = gate<void>();
  const original = ShellOutputBuffer.prototype.finish;
  vi.spyOn(ShellOutputBuffer.prototype, "finish").mockImplementation(
    async function (this: ShellOutputBuffer) {
      flushing.resolve();
      await releaseFlush.promise;
      return original.call(this);
    },
  );
  stop.mockImplementation(async () => {
    await cleanup.promise;
  });
  const abort = new AbortController();
  const result = executor.execute(
    "/unused",
    { command: "command" },
    { signal: abort.signal, publish() {} },
  );
  await started.promise;
  exited.resolve(exit);
  settled.resolve(exit);
  await flushing.promise;
  abort.abort();
  releaseFlush.resolve();
  cleanup.resolve();
  expect(await result).toMatchObject({
    kind: "unknown",
    data: { output: "retained", termination: "cancelled" },
  });
  expect(stop).toHaveBeenCalledOnce();
});

it("ordinary foreground exit waits for output settlement without requesting termination", async () => {
  const { executor, exited, settled, started, stop } = setup();
  const result = executor.execute(
    "/unused",
    { command: "command" },
    { signal: new AbortController().signal, publish() {} },
  );
  await started.promise;
  exited.resolve(exit);
  settled.resolve(exit);
  expect(await result).toMatchObject({
    kind: "succeeded",
    data: { output: "retained", termination: "exited" },
  });
  expect(stop).not.toHaveBeenCalled();
});
