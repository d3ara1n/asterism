import { describe, expect, it, vi } from "vitest";
import { startupText } from "./startup-text.ts";
import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";
const message = pluginNamespace("example.startup").messages("en", defineMessages({ failure: { id: "failure", defaultMessage: "Open failed: {object}" } })).failure;
describe("Localization boundary for startup failure prompts", () => {
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
