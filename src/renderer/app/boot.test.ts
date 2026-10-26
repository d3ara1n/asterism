import { expect, it, vi } from "vitest";
import type { StartupBridge, StartupState } from "../../shared/startup.ts";
import { awaitStartup, StartupError, waitForRuntime } from "./boot.ts";

// 页面首次打开或刷新时，失败可能早于订阅；持久在主进程的当前状态必须结束等待。
it("读取已经发生的后台启动失败，保留原因并撤销订阅", async () => {
  const close = vi.fn();
  const failure = { status: "failed", reason: "database_version", detail: "Format mismatch." } as const;
  const bridge: StartupBridge = { get: async () => failure, onChanged: () => close,
    restart: async () => {}, openDataDirectory: async () => "", openBackup: async () => "", recover: async () => {}, initialized: async () => {} };
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
    restart: async () => {}, openDataDirectory: async () => "", openBackup: async () => "", recover: async () => {}, initialized: async () => {},
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
