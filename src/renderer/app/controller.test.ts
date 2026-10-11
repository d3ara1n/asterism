import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CommandResult } from "../../shared/contracts.ts";
import { ApplicationController } from "./controller.ts";

const snapshot: AppSnapshot = { workspace: { id: "w", title: "Workspace" }, sessions: [], plugins: [], restartRequired: false };
describe("应用会话列表", () => {
  it("查询途中再次刷新时补读，晚到创建可刷新列表且不携带任何会话位置", async () => {
    const requests: Array<(result: CommandResult) => void> = [];
    const execute = vi.fn(() => new Promise<CommandResult>(resolve => requests.push(resolve)));
    const controller = new ApplicationController({ execute, onStatus: () => () => {} });
    const first = controller.refresh();
    void controller.refresh();
    requests[0]!({ ok: true, snapshot });
    await Promise.resolve();
    requests[1]!({ ok: true, snapshot: { ...snapshot, sessions: [{ id: "new", title: "New", created_at: "" }] } });
    await first;
    expect(execute.mock.calls).toHaveLength(2);
    expect(controller.getSnapshot().snapshot?.sessions.map(session => session.id)).toEqual(["new"]);
    expect(controller.getSnapshot().snapshot).not.toHaveProperty("session");
  });
});
