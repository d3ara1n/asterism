import { describe, expect, it, vi } from "vitest";
import { startupText } from "./startup-text.ts";
import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";
import { MessageFormatter } from "../shared/i18n.ts";
const message = pluginNamespace("example.startup").messages("en", defineMessages({ failure: { id: "failure", defaultMessage: "Open failed: {object}" } })).failure;
describe("启动失败提示的本地化边界", () => {
  it("启动阶段通过本地格式化入口处理消息，不依赖任务进程或 renderer", () => {
    const formatter = new MessageFormatter("zh-Hans", [{ owner: "example.startup", locale: "zh-Hans", revision: "1", messages: { failure: "打开失败：{object}" } }]);
    expect(startupText({ ...message, values: { object: "Workspace" } }, () => "zh-Hans", () => formatter)).toBe("打开失败：Workspace");
  });
  it.each(["language", "formatter"] as const)("%s 初始化失败仍返回可靠的默认提示，不向调用方抛出异常", failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const read = () => { if (failure === "language") throw new Error("Language settings are unreadable."); return "zh-Hans"; };
      const create = () => { throw new Error("The catalog or formatter is unavailable."); };
      expect(startupText(message, read, create)).toBe(message.defaultMessage);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
