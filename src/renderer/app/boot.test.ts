import { expect, it, vi } from "vitest";
import type { StartupBridge, StartupState } from "../../shared/startup.ts";
import { awaitStartup, StartupError, waitForRuntime } from "./boot.ts";

// 页面首次打开或刷新时，失败可能早于订阅；持久在主进程的当前状态必须结束等待。
it("读取已经发生的后台启动失败，保留原因并撤销订阅", async () => {
  const close = vi.fn();
  const failure = { status: "failed", reason: "database_version", detail: "Format mismatch." } as const;
  const bridge: StartupBridge = { get: async () => failure, onChanged: () => close,
    restart: async () => {}, openDataDirectory: async () => "", recover: async () => {}, openRecoveryPoint: async () => "", initialized: async () => [] };
  await expect(waitForRuntime(bridge, new AbortController().signal, () => {})).rejects.toEqual(new StartupError(failure));
  expect(close).toHaveBeenCalledTimes(1);
});

// 先订阅再读能接住就绪事件；启动结束后读取返回的旧阶段不能把界面退回等待。
it("就绪通知完成等待，迟到的初始读取不再发布进度", async () => {
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

// 用户关闭页面时，悬而未决的插件导入不能继续占用启动等待；无需模拟真实期限。
it("取消结束启动等待，随后到达的导入结果不改变失败结果", async () => {
  let finish!: (value: string) => void;
  const controller = new AbortController();
  const pending = awaitStartup(new Promise<string>(resolve => { finish = resolve; }), controller.signal);
  const reason = new Error("Page closed.");
  controller.abort(reason);
  finish("loaded");
  await expect(pending).rejects.toBe(reason);
});

// 数据迁移可以长于桌面桥初始化期限；首次读取结束后，该作用域取消不能撤销后台订阅。
it("桌面桥读取完成后只由后台状态结束数据准备等待", async () => {
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

// 初始 IPC 未响应时仍需结束等待，且不能留下状态订阅；直接取消作用域，无需真实计时器。
it("桌面桥读取未完成时取消初始化会撤销后台订阅", async () => {
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
