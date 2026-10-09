import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CommandResult } from "../../shared/contracts.ts";
import { ApplicationController } from "./controller.ts";

const snapshot = (at: string | null): AppSnapshot => ({
  workspace: { id: "workspace", title: "Workspace" }, sessions: [],
  session: { id: "session", title: "Session", created_at: "", objects: [], links: [], views: [], viewport: { x: 0, y: 0, zoom: 1 }, at },
});

describe("历史工作台命令", () => {
  it("历史查看期间拒绝领域变更，不调用运行时", async () => {
    const execute = vi.fn();
    const controller = new ApplicationController({ execute, onStatus: () => () => {} });
    expect(await controller.run({ type: "object.remove", session_id: "session", object_id: "note" }, () => "history")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).not.toBeNull();
  });

  it("保存历史视图后按查看位置查询，不把当前分支短暂显示出来", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ok: true, snapshot: snapshot(null) })
      .mockResolvedValueOnce({ ok: true, snapshot: snapshot("history") });
    const controller = new ApplicationController({ execute, onStatus: () => () => {} });
    const displayed: Array<string | null> = [];
    controller.subscribe(() => {
      const current = controller.getSnapshot().snapshot?.session;
      if (current) displayed.push(current.at);
    });
    expect(await controller.run({ type: "view.set", session_id: "session", object_id: "note", hidden: true }, () => "history")).toBe(true);
    expect(execute.mock.calls[1]).toEqual([{ type: "workspace.read", session_id: "session", at: "history" }]);
    expect(displayed.every(at => at === "history")).toBe(true);
  });

  it("排队中的变更在执行前再次检查查看位置", async () => {
    let resolve!: (result: CommandResult) => void;
    const execute = vi.fn(() => new Promise<CommandResult>(r => { resolve = r; }));
    const controller = new ApplicationController({ execute, onStatus: () => () => {} });
    const first = controller.run({ type: "workspace.read" });
    let at: string | undefined;
    const queued = controller.run({ type: "object.remove", session_id: "session", object_id: "note" }, () => at);
    await Promise.resolve();
    at = "history";
    resolve({ ok: true, snapshot: snapshot(null) });
    await first;
    expect(await queued).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
