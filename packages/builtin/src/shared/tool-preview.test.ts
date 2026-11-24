import { describe, expect, it } from "vitest";
import { characterCount, editIntents, inputText, toolTextTail } from "./tool-preview.ts";

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

// Expectations come from the edit argument contract: each operation is reported with the fields the caller actually supplied, and nothing is invented for a malformed entry.
describe("edit intents", () => {
  it("keeps array order and reported anchors, and reads append without an anchor", () => {
    const intents = editIntents({ edits: [
      { op: "replace", anchor: { line: 3, hash: "ABCD" }, end: { line: 5, hash: "EFGH" }, body: ["a", "", "b"] },
      { op: "append", body: ["tail"] },
    ] });
    expect(intents).toEqual([
      { index: 1, op: "replace", anchor: { line: 3, hash: "ABCD" }, end: { line: 5, hash: "EFGH" }, body: ["a", "", "b"] },
      { index: 2, op: "append", anchor: null, end: null, body: ["tail"] },
    ]);
  });
  it("skips entries without an operation and non-text body rows instead of fabricating input", () => {
    expect(editIntents({ edits: [{ body: ["a"] }, { op: "delete", body: ["a", 4] }] }))
      .toEqual([{ index: 2, op: "delete", anchor: null, end: null, body: ["a"] }]);
    expect(editIntents({ edits: "replace" })).toEqual([]);
  });
});
