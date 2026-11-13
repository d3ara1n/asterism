import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { displayInputParts, resourceEventText, splitResourceEventText } from "./input.ts";

describe("resource event frontmatter", () => {
  it("writes metadata a YAML parser reads back exactly, including strings that look like other scalars", () => {
    const metadata = { event: "todo.completed", reserved: "null", yes: "yes", number: "42", time: "2026-01-01T00:00:00.000Z",
      colon: "a: b", hash: "x #y", dashes: "---", multiline: "line\n---\nnext", quote: 'say "hi"',
      count: 3, flag: false, empty: null, actor: { kind: "agent", ref: { id: "a" }, title: "Worker: 1" }, ids: ["a", "b"] };
    const text = resourceEventText(metadata, "Body");
    const { metadata: block, body } = splitResourceEventText(text);
    expect(parse(block!)).toEqual(metadata);
    expect(body).toBe("Body");
  });

  it("keeps text without a complete leading block as body, and hides only an event's leading metadata from display", () => {
    expect(splitResourceEventText("---\nunterminated")).toEqual({ metadata: null, body: "---\nunterminated" });
    expect(splitResourceEventText("Intro\n---\nx: 1\n---")).toEqual({ metadata: null, body: "Intro\n---\nx: 1\n---" });
    expect(resourceEventText({}, "Only body")).toBe("Only body");
    const event = { kind: "text" as const, text: resourceEventText({ event: "chat" }, "") };
    const file = { kind: "file-reference" as const, ref: { source: { sessionId: "s", id: "c", kind: "k" }, locator: null }, mediaType: "image/png" };
    expect(displayInputParts({ sender: { kind: "event" }, parts: [event, { kind: "text", text: "Hello" }, file] }))
      .toEqual([{ kind: "text", text: "Hello" }, file]);
    // A user may type frontmatter-like text; it is their message, not metadata.
    const typed = { kind: "text" as const, text: "---\na: 1\n---\nhi" };
    expect(displayInputParts({ sender: { kind: "user" }, parts: [typed] })).toEqual([typed]);
  });
});
