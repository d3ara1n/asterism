import { describe, expect, it } from "vitest";
import { parseEditorText, serializeEditorText } from "./text-format.ts";

describe("Editor file serialization", () => {
  it("preserves a UTF-8 BOM and Windows newlines when inserting a line", () => {
    const file = parseEditorText("\uFEFFfirst\r\nlast\r\n");
    expect(file.content).toBe("first\nlast\n");
    expect(serializeEditorText("first\ninserted\nlast\n", file.format)).toBe("\uFEFFfirst\r\ninserted\r\nlast\r\n");
  });

  it("does not add a final newline or BOM to an existing Unix text file", () => {
    const file = parseEditorText("first\nlast");
    expect(serializeEditorText("first\nedited", file.format)).toBe("first\nedited");
  });

  it("uses Unix newlines for an initially empty file", () => {
    expect(serializeEditorText("new\ntext", parseEditorText("").format)).toBe("new\ntext");
  });

  it("normalizes mixed newlines to the first newline style on save", () => {
    const file = parseEditorText("one\rtwo\r\nthree\n");
    expect(file.content).toBe("one\ntwo\nthree\n");
    expect(serializeEditorText(file.content, file.format)).toBe("one\rtwo\rthree\r");
  });
});
