import { describe, expect, it, vi } from "vitest";
import { startupText } from "./startup-text.ts";
import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";
import { MessageFormatter } from "../shared/i18n.ts";
const message = pluginNamespace("example.startup").messages("en", defineMessages({ failure: { id: "failure", defaultMessage: "Open failed: {object}" } })).failure;
describe("Localization boundary for startup failure prompts", () => {
  it("startup formats messages locally without depending on the task process or renderer", () => {
    const formatter = new MessageFormatter("zh-Hans", [{ owner: "example.startup", locale: "zh-Hans", revision: "1", messages: { failure: "打开失败：{object}" } }]);
    expect(startupText({ ...message, values: { object: "Workspace" } }, () => "zh-Hans", () => formatter)).toBe("打开失败：Workspace");
  });
  it.each(["language", "formatter"] as const)("%s initialization failure still returns reliable default prompts without throwing to the caller", failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const read = () => { if (failure === "language") throw new Error("Language settings are unreadable."); return "zh-Hans"; };
      const create = () => { throw new Error("The catalog or formatter is unavailable."); };
      expect(startupText(message, read, create)).toBe(message.defaultMessage);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
