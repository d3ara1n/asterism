import { expect, it, vi } from "vitest";
import type { StartupBridge, StartupState } from "../../shared/startup.ts";
import { awaitStartup, StartupError, waitForRuntime } from "./boot.ts";

// On initial page load or refresh, failure may precede subscription; the current state retained in the main process must end the wait.
it("reads an existing backend startup failure, preserves its reason, and removes the subscription", async () => {
  const close = vi.fn();
  const failure = { status: "failed", reason: "database_version", detail: "Format mismatch." } as const;
  const bridge: StartupBridge = { get: async () => failure, onChanged: () => close,
    restart: async () => {}, openDataDirectory: async () => "", recover: async () => {}, openRecoveryPoint: async () => "", initialized: async () => [] };
  await expect(waitForRuntime(bridge, new AbortController().signal, () => {})).rejects.toEqual(new StartupError(failure));
  expect(close).toHaveBeenCalledTimes(1);
});

// Subscribing before reading captures the ready event; an old phase returned by the read after startup completes must not return the UI to waiting.
it("ready notification completes the wait, and a late initial read no longer publishes progress", async () => {
  let receive!: (state: StartupState) => void;
  let respond!: (state: StartupState) => void;
  const progress = vi.fn(), close = vi.fn();
  const bridge: StartupBridge = {
    onChanged(listener) { receive = listener; return close; },
    get: () => new Promise(resolve => { respond = resolve; }),
    restart: async () => {}, openDataDirectory: async () => "", recover: async () => {}, openRecoveryPoint: async () => "", initialized: async () => [],
  };
  const ready = waitForRuntime(bridge, new AbortController().signal, progress);
  receive({ status: "starting", stage: "plugins" });
  receive({ status: "ready" });
  respond({ status: "starting", stage: "environment" });
  await ready;
  expect(progress.mock.calls).toEqual([[{ status: "starting", stage: "plugins" }]]);
  expect(close).toHaveBeenCalledTimes(1);
});

// When the user closes the page, a pending plugin import must not keep the startup wait active; no real deadline needs to be simulated.
it("cancellation ends the startup wait, and a later import result does not change the failure result", async () => {
  let finish!: (value: string) => void;
  const controller = new AbortController();
  const pending = awaitStartup(new Promise<string>(resolve => { finish = resolve; }), controller.signal);
  const reason = new Error("Page closed.");
  controller.abort(reason);
  finish("loaded");
  await expect(pending).rejects.toBe(reason);
});

// Data migration can exceed the desktop bridge initialization deadline; after the initial read completes, cancellation of that scope must not remove the backend subscription.
it("after the desktop bridge read completes, only backend state ends the data preparation wait", async () => {
  const initialization = new AbortController(), lifetime = new AbortController();
  let receive!: (state: StartupState) => void;
  let observed!: () => void;
  const initial = new Promise<void>(resolve => { observed = resolve; });
  const close = vi.fn();
  const bridge: StartupBridge = {
    get: async () => ({ status: "starting", stage: "dataBackup" }),
    onChanged(listener) { receive = listener; return close; },
    restart: async () => {}, openDataDirectory: async () => "", recover: async () => {}, openRecoveryPoint: async () => "", initialized: async () => [],
  };
  const ready = waitForRuntime(bridge, lifetime.signal, observed, initialization.signal);
  await initial;
  initialization.abort(new Error("Desktop initialization scope ended."));
  expect(close).not.toHaveBeenCalled();
  receive({ status: "ready" });
  await expect(ready).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledOnce();
});

// If the initial IPC does not respond, waiting must still end without leaving a state subscription; cancel the scope directly without a real timer.
it("cancelling initialization before the desktop bridge read completes removes the backend subscription", async () => {
  const initialization = new AbortController();
  let respond!: (state: StartupState) => void;
  const close = vi.fn();
  const bridge: StartupBridge = {
    get: () => new Promise(resolve => { respond = resolve; }), onChanged: () => close,
    restart: async () => {}, openDataDirectory: async () => "", recover: async () => {}, openRecoveryPoint: async () => "", initialized: async () => [],
  };
  const ready = waitForRuntime(bridge, new AbortController().signal, () => {}, initialization.signal);
  const reason = new Error("Desktop bridge unavailable.");
  initialization.abort(reason);
  await expect(ready).rejects.toBe(reason);
  expect(close).toHaveBeenCalledOnce();
  respond({ status: "ready" });
});
