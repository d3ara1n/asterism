import { describe, expect, it } from "vitest";
import { referenceDragType } from "@asterism-app/sdk/renderer";
import { droppedPathText, isFileDrag } from "./file-drop";

it("offers file targets without taking over internal reference or plain-text drags", () => {
  expect(isFileDrag(["Files", "text/uri-list"])).toBe(true);
  expect(isFileDrag(["Files", referenceDragType])).toBe(false);
  expect(isFileDrag(["text/plain"])).toBe(false);
});

describe("dropped path text", () => {
  const first = new File([], "Summary draft.md");
  const second = new File([], "Notes.md");

  it("keeps native path spelling and drop order, with one path per line", () => {
    const paths = new Map([
      [first, "/Users/me/项目/Summary draft.md"],
      [second, String.raw`C:\Reports\Notes.md`],
    ]);
    expect(droppedPathText([first, second], file => paths.get(file) ?? null))
      .toBe("/Users/me/项目/Summary draft.md\n" + String.raw`C:\Reports\Notes.md`);
  });

  it("rejects the entire batch if a native path is missing, even when a filename is present", () => {
    expect(droppedPathText([first, second], file => file === first ? "/tmp/Summary draft.md" : null)).toBeNull();
  });

  it("treats a file transfer with no accessible files as unavailable", () => {
    expect(droppedPathText([], () => "/not-a-dropped-file")).toBeNull();
  });
});
