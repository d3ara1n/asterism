import { expect, it } from "vitest";
import { workbenchPhase } from "./feedback";

// loading 只表示首次内容尚未就绪；后台更新保持现有工作台。
it("首次读取、读取错误与后台不可用分别呈现", () => {
  expect(workbenchPhase("starting", null)).toBe("starting");
  expect(workbenchPhase("ready", null)).toBe("loading");
  expect(workbenchPhase("ready", { status: "loading" })).toBe("loading");
  expect(workbenchPhase("ready", { status: "ready" })).toBe("ready");
  expect(workbenchPhase("ready", { status: "error" })).toBe("read-error");
  expect(workbenchPhase("unavailable", { status: "ready" })).toBe("unavailable");
  expect(workbenchPhase("stopping", { status: "error" })).toBe("unavailable");
});
