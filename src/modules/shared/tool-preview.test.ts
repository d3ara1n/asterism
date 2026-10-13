import { describe, expect, it } from "vitest";
import { characterCount, inputText, toolTextTail } from "./tool-preview.ts";

describe("正文填充预览", () => {
  it("缺失和错误字段不冒充正文，字符计数使用 Unicode 码点", () => {
    expect(inputText(null, "content")).toBeUndefined();
    expect(inputText({ content: 4 }, "content")).toBeUndefined();
    expect(inputText({ content: "" }, "content")).toBe("");
    expect(characterCount("中😀a")).toBe(3);
  });
  it("长正文只交付有界尾部，保留最新文本，不从代理对中间截断", () => {
    const text = "old\n".repeat(100_000) + "latest";
    const tail = toolTextTail(text);
    expect(tail.endsWith("latest")).toBe(true);
    expect(tail.length).toBeLessThan(text.length);
    const withEmoji = toolTextTail("😀".repeat(100_000) + "latest");
    expect(withEmoji.endsWith("latest")).toBe(true);
    expect(Buffer.from(withEmoji).toString("utf8")).toBe(withEmoji);
  });
});
