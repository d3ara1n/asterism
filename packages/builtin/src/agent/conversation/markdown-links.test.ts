import { describe, expect, it } from "vitest";
import { scopeMarkdownAnchors } from "./markdown-links";

describe("Markdown navigation", () => {
  it("scopes both footnote directions and accessible descriptions to one document", () => {
    const reference = { type: "element", properties: {
      id: "user-content-fnref-1", href: "#user-content-fn-1", ariaDescribedBy: ["footnote-label"],
    } };
    const label = { type: "element", properties: { id: "footnote-label" } };
    const footnote = { type: "element", properties: { id: "user-content-fn-1" },
      children: [{ type: "element", properties: { href: "#user-content-fnref-1" } }] };
    const external = { type: "element", properties: { href: "https://example.com/#part" } };
    scopeMarkdownAnchors({ type: "root", children: [reference, label, footnote, external] }, "message-A-");
    expect(reference.properties).toEqual({
      id: "message-A-user-content-fnref-1", href: "#message-A-user-content-fn-1",
      ariaDescribedBy: ["message-A-footnote-label"],
    });
    expect(label.properties.id).toBe("message-A-footnote-label");
    expect(footnote.properties.id).toBe("message-A-user-content-fn-1");
    expect(footnote.children[0]!.properties.href).toBe("#message-A-user-content-fnref-1");
    expect(external.properties.href).toBe("https://example.com/#part");
  });

  it("preserves the literal percent-encoded IDs emitted for non-ASCII footnote labels", () => {
    const target = { type: "element", properties: { id: "user-content-fn-%E8%AF%B4%E6%98%8E" } };
    const link = { type: "element", properties: { href: "#user-content-fn-%E8%AF%B4%E6%98%8E" } };
    scopeMarkdownAnchors({ type: "root", children: [target, link] }, "message-B-");
    expect(target.properties.id).toBe("message-B-user-content-fn-%E8%AF%B4%E6%98%8E");
    expect(link.properties.href).toBe("#message-B-user-content-fn-%E8%AF%B4%E6%98%8E");
  });
});
