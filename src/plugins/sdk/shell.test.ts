import { afterEach, expect, it, vi } from "vitest";
import type { ShellSettings } from "@asterism-app/sdk/contracts";
import { ShellHost } from "../../shell/host.ts";
import { startShellProcess, type ProcessExit } from "../../shell/process.ts";
import { RunLifecycle } from "../lifecycle.ts";
import { bindShellServices } from "./shell.ts";

vi.mock("../../shell/process.ts", () => ({ startShellProcess: vi.fn() }));
vi.mock("../../shell/terminal/session.ts", () => ({ SharedTerminal: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const exit: ProcessExit = { exitCode: 0, signal: null, error: null };
function fixture() {
  const settings: ShellSettings = {
    selected: "a",
    profiles: ["a", "b"].map((id) => ({
      id,
      executable: process.execPath,
      args: [`--${id}`],
      commandArgs: ["-c"],
      env: { CAPTURE_TEST: id },
    })),
  };
  const host = new ShellHost(() => settings, "/unused");
  const lifecycle = new RunLifecycle(() => {}),
    runs = lifecycle.group("call");
  let available = true;
  const shell = bindShellServices(host, runs, () => {
    if (!available) throw new Error("plugin unavailable");
  });
  return {
    settings,
    host,
    lifecycle,
    runs,
    shell,
    unavailable: () => {
      available = false;
    },
  };
}
const options = () => ({ signal: new AbortController().signal, publish() {} });

it("captures cloned configuration A while later captures and operation-current commands use B", async () => {
  const { settings, shell } = fixture();
  vi.mocked(startShellProcess).mockImplementation(
    (_executable, args, options) => {
      const settled = options
        .onData(
          "stdout",
          Buffer.from(`${args.join(" ")}:${options.env.CAPTURE_TEST}`),
        )
        .then(() => exit);
      return {
        exited: Promise.resolve(exit),
        settled,
        stop: vi.fn(async () => {}),
      };
    },
  );
  const captured = shell.capture();
  // Mutating nested arrays and overrides must not change the already captured configuration.
  settings.profiles[0]!.args[0] = "--changed";
  settings.profiles[0]!.env.CAPTURE_TEST = "changed";
  settings.selected = "b";
  const fresh = shell.capture();
  expect(
    await captured.execute("/unused", { command: "old" }, options()),
  ).toMatchObject({ kind: "succeeded", data: { output: "--a -c old:a" } });
  expect(
    await fresh.execute("/unused", { command: "new" }, options()),
  ).toMatchObject({ kind: "succeeded", data: { output: "--b -c new:b" } });
  expect(
    await shell.execute("/unused", { command: "current" }, options()),
  ).toMatchObject({ kind: "succeeded", data: { output: "--b -c current:b" } });
});

it.each(["caller", "plugin", "host"] as const)(
  "captured execution remains cancellable by %s after foreground exit",
  async (source) => {
    const { shell, runs, host } = fixture();
    const started = gate<void>(),
      exited = gate<ProcessExit>(),
      settled = gate<ProcessExit>(),
      cleanup = gate<void>();
    const stop = vi.fn(async () => {
      await cleanup.promise;
      settled.resolve(exit);
    });
    vi.mocked(startShellProcess).mockImplementation(
      (_executable, _args, options) => {
        void options
          .onData("stdout", Buffer.from("accepted"))
          .then(() => started.resolve());
        return { exited: exited.promise, settled: settled.promise, stop };
      },
    );
    const abort = new AbortController();
    const captured = shell.capture();
    const result = captured.execute(
      "/unused",
      { command: "command" },
      { signal: abort.signal, publish() {} },
    );
    await started.promise;
    exited.resolve(exit);
    await exited.promise;
    let closing: Promise<void> | undefined;
    if (source === "caller") abort.abort();
    else if (source === "plugin") closing = runs.close();
    else closing = host.close();
    expect(stop).toHaveBeenCalledOnce();
    cleanup.resolve();
    expect(await result).toMatchObject({
      kind: "unknown",
      data: { termination: "cancelled", output: "accepted" },
    });
    await closing;
    if (source === "plugin")
      expect(() =>
        captured.execute("/unused", { command: "late" }, options()),
      ).toThrow("closing");
    if (source === "host")
      expect(
        await captured.execute("/unused", { command: "late" }, options()),
      ).toMatchObject({ kind: "cancelled" });
  },
);

it("rechecks plugin availability on a previously captured handle", () => {
  const { shell, unavailable } = fixture();
  const captured = shell.capture();
  unavailable();
  expect(() =>
    captured.execute("/unused", { command: "late" }, options()),
  ).toThrow("plugin unavailable");
  expect(() => shell.capture()).toThrow("plugin unavailable");
});
