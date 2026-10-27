import { describe, expect, it } from "vitest";
import { characterCount, inputText, toolTextTail } from "./tool-preview.ts";

describe("body input previews", () => {
  it("does not treat missing or invalid fields as body text and counts Unicode code points", () => {
    expect(inputText(null, "content")).toBeUndefined();
    expect(inputText({ content: 4 }, "content")).toBeUndefined();
    expect(inputText({ content: "" }, "content")).toBe("");
    expect(characterCount("中😀a")).toBe(3);
  });
  it("delivers only a bounded tail of long text, preserving the latest text without splitting surrogate pairs", () => {
    const text = "old\n".repeat(100_000) + "latest";
    const tail = toolTextTail(text);
    expect(tail.endsWith("latest")).toBe(true);
    expect(tail.length).toBeLessThan(text.length);
    const withEmoji = toolTextTail("😀".repeat(100_000) + "latest");
    expect(withEmoji.endsWith("latest")).toBe(true);
    expect(Buffer.from(withEmoji).toString("utf8")).toBe(withEmoji);
  });
});
