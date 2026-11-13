import { describe, expect, it } from "vitest";
import { serializeDoc, parseComposerText, parseComposerInline, referenceTriggerAllowedAfter } from "./reference-serialization";

describe("Reference serialization", () => {
  it("serializes a doc with text and chips to markdown link text", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Check " },
          { type: "referenceChip", attrs: { label: "crash.log", href: "resource:Dir-1/logs/crash.log" } },
          { type: "text", text: " for details." },
        ],
      }],
    };
    expect(serializeDoc(doc)).toBe("Check [crash.log](resource:Dir-1/logs/crash.log) for details.");
  });

  it("serializes multiple paragraphs separated by newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "referenceChip", attrs: { label: "pricing", href: "skill:pricing" } }] },
      ],
    };
    expect(serializeDoc(doc)).toBe("Line one\n[pricing](skill:pricing)");
  });

  it("returns empty string for null/empty docs", () => {
    expect(serializeDoc(null)).toBe("");
    expect(serializeDoc({})).toBe("");
  });

  it("parses plain text with a resource link into chip + text nodes", () => {
    const result = parseComposerText("See [notes](resource:Dir-1/notes.md) here");
    expect(result).toEqual({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          { type: "referenceChip", attrs: { label: "notes", href: "resource:Dir-1/notes.md" } },
          { type: "text", text: " here" },
        ],
      }],
    });
  });

  it("parses a skill reference", () => {
    const result = parseComposerText("[pricing](skill:pricing)");
    expect(result.content![0]!.content).toEqual([
      { type: "referenceChip", attrs: { label: "pricing", href: "skill:pricing" } },
    ]);
  });

  it("preserves model labels and nested model URLs through composer parsing and submission", () => {
    const input = "Use [Model:long context](model:relay/vendor/model-v1) here";
    const doc = parseComposerText(input);
    expect(doc.content![0]!.content).toEqual([
      { type: "text", text: "Use " },
      { type: "referenceChip", attrs: { label: "Model:long context", href: "model:relay/vendor/model-v1" } },
      { type: "text", text: " here" },
    ]);
    expect(serializeDoc(doc)).toBe(input);
  });

  it("keeps incomplete model references as literal text", () => {
    expect(parseComposerInline("[Model](model:relay)")).toEqual([{ type: "text", text: "[Model](model:relay)" }]);
  });

  it("leaves non-reference markdown links as literal text", () => {
    const result = parseComposerText("[google](https://google.com)");
    expect(result.content![0]!.content).toEqual([
      { type: "text", text: "[google](https://google.com)" },
    ]);
  });

  it("handles multiple lines", () => {
    const result = parseComposerText("Line 1\nLine 2");
    expect(result.content).toHaveLength(2);
    expect(result.content![0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Line 1" }] });
  });

  it("round-trips text with chips through serialize → parse → serialize", () => {
    const original = "Hello [crash.log](resource:Dir-1/logs/crash.log) world";
    const parsed = parseComposerText(original);
    const serialized = serializeDoc(parsed);
    expect(serialized).toBe(original);
  });

  it("opens the @ trigger after line start, spaces, CJK text and chips, but not inside Latin words", () => {
    for (const previous of ["", " ", "\n", "看", "，", "\uFFFC", "("]) expect(referenceTriggerAllowedAfter(previous)).toBe(true);
    for (const previous of ["a", "Z", "7", "_"]) expect(referenceTriggerAllowedAfter(previous)).toBe(false);
  });

  it("keeps a non-reference link inside a line with a reference as text", () => {
    expect(parseComposerText("[a](https://x.dev) [b](skill:b)").content![0]!.content).toEqual([
      { type: "text", text: "[a](https://x.dev) " },
      { type: "referenceChip", attrs: { label: "b", href: "skill:b" } },
    ]);
  });
  it("parses dropped multi-line reference text into inline content with hard breaks", () => {
    expect(parseComposerInline("[a.md](resource:D/a.md)\nsee [pricing](skill:pricing)")).toEqual([
      { type: "referenceChip", attrs: { label: "a.md", href: "resource:D/a.md" } },
      { type: "hardBreak" },
      { type: "text", text: "see " },
      { type: "referenceChip", attrs: { label: "pricing", href: "skill:pricing" } },
    ]);
  });
});
