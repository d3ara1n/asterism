import { describe, expect, it } from "vitest";
import { workbenchPhase } from "./feedback";

// docs/workbench.md#工作台状态反馈：失败不得当作等待，操作受理与随后同步分别呈现。
describe("工作台反馈归属", () => {
  it("读取失败优先于尚未收束的操作，不能显示保存或同步中", () => {
    expect(workbenchPhase("ready", { status: "error", busy: true })).toBe("read-error");
    expect(workbenchPhase("ready", { status: "error", busy: false })).toBe("read-error");
  });

  it("操作由发起处提示，受理后等待新视图才属于工作台同步", () => {
    expect(workbenchPhase("ready", { status: "loading", busy: true })).toBe("processing");
    expect(workbenchPhase("ready", { status: "loading", busy: false })).toBe("syncing");
    expect(workbenchPhase("ready", { status: "ready", busy: false })).toBe("ready");
  });

  it("后台不可用覆盖会话旧状态，不能继续显示同步中", () => {
    expect(workbenchPhase("unavailable", { status: "loading", busy: true })).toBe("unavailable");
    expect(workbenchPhase("stopping", { status: "ready", busy: false })).toBe("unavailable");
  });

  it("没有首份内容时仍区分连接后台和读取会话", () => {
    expect(workbenchPhase("starting", null)).toBe("starting");
    expect(workbenchPhase("ready", null)).toBe("syncing");
  });
});
