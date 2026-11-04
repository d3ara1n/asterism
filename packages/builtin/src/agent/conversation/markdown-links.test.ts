import { describe, expect, it } from "vitest";
import { markdownUrl, scopeMarkdownAnchors } from "./markdown-links";

describe("Markdown navigation", () => {
  it("retains local anchors and resource destinations only for link attributes", () => {
    expect(markdownUrl("#user-content-fn-1", "href")).toBe("#user-content-fn-1");
    expect(markdownUrl("resource:Manual-A?location=sdk%2Fguide.md", "href"))
      .toBe("resource:Manual-A?location=sdk%2Fguide.md");
    expect(markdownUrl("#user-content-fn-1", "src")).toBe("");
    expect(markdownUrl("resource:Manual-A?location=sdk%2Fguide.md", "src")).toBe("");
    expect(markdownUrl("https://example.com/image.png", "src")).toBe("https://example.com/image.png");
  });

  it("keeps bare paths, malformed resource addresses and executable schemes inert", () => {
    for (const url of ["../file.md", "/etc/passwd", "file:///etc/passwd", "javascript:alert(1)",
      "resource:abc?location=%XX"]) expect(markdownUrl(url, "href")).toBe("");
  });

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
