import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { resolveLineSelection } from "./navigation.ts";
import { editorDocument, parseEditorText, serializeEditorText } from "./text-format.ts";

const doc = Text.of(["header", "first line", "last line", "footer"]);

describe("Editor line navigation", () => {
  it("places a single-line cursor at the line start without selecting text", () => {
    expect(resolveLineSelection(doc, { startLine: 2 })).toEqual({ anchor: 7, head: 7 });
  });

  it("selects both endpoint lines but not the newline after the range", () => {
    const selection = resolveLineSelection(doc, { startLine: 2, endLine: 3 })!;
    expect(doc.sliceString(selection.anchor, selection.head)).toBe("first line\nlast line");
  });

  it("leaves the selection alone if either endpoint is outside the document", () => {
    expect(resolveLineSelection(doc, { startLine: 5 })).toBeUndefined();
    expect(resolveLineSelection(doc, { startLine: 2, endLine: 5 })).toBeUndefined();
  });

  it("uses Directory line coordinates without changing bare carriage returns on save", () => {
    const disk = "alpha\rbeta\r\ngamma";
    const { content, format } = parseEditorText(disk, "lf");
    const directory = editorDocument(content);
    const selection = resolveLineSelection(directory, { startLine: 2, endLine: 2 })!;
    expect(directory.sliceString(selection.anchor, selection.head)).toBe("gamma");
    expect(serializeEditorText(directory.toString(), format)).toBe(disk);
  });
});
