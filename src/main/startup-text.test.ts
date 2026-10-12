import { describe, expect, it, vi } from "vitest";
import { startupText } from "./startup-text.ts";
import { startupMessages } from "../shared/error-display.ts";
describe("启动失败提示的本地化边界", () => {
  it("无任务进程或 renderer 也能格式化已知启动提示", () => {
    expect(startupText(startupMessages.windowLoadFailed, () => "zh-Hans")).toBe("无法加载应用窗口。");
    expect(startupText(startupMessages.workspaceOpenFailed, () => "en-GB")).toBe("The workspace could not be opened.");
  });
  it.each(["language", "formatter"] as const)("%s 初始化失败仍返回可靠的默认提示，不向调用方抛出异常", failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const read = () => { if (failure === "language") throw new Error("Language settings are unreadable."); return "zh-Hans"; };
      const create = () => { throw new Error("The catalog or formatter is unavailable."); };
      expect(startupText(startupMessages.windowLoadFailed, read, create)).toBe(startupMessages.windowLoadFailed.defaultMessage);
      expect(log).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
});
