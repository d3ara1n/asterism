import { describe, expect, it } from "vitest";
import { allowRendererPermission } from "./permissions.ts";

describe("Main window browser permissions", () => {
  // Copy requires write permission for both development URLs and packaged file URLs.
  it.each(["http://127.0.0.1:5173/", "file:///app/renderer/index.html"])("trusted main frames can write the clipboard and enumerate fonts: %s", trustedURL => {
    const contents = { getURL: () => `${trustedURL}#workbench` };
    const frame = { contents, mainContents: contents, trustedURL, isMainFrame: true };
    expect(allowRendererPermission({ ...frame, permission: "clipboard-sanitized-write" })).toBe(true);
    expect(allowRendererPermission({ ...frame, permission: "local-fonts" })).toBe(true);
    expect(allowRendererPermission({ ...frame, permission: "clipboard-read" })).toBe(false);
    expect(allowRendererPermission({ ...frame, permission: "media" })).toBe(false);
  });

  // Limit access to existing trusted windows; allowing copy must not authorize subframes, other windows, or pages after navigation.
  it("clipboard writes remain constrained by window identity, main frame, and page URL", () => {
    const trustedURL = "file:///app/renderer/index.html";
    const contents = { getURL: () => trustedURL };
    const frame = { contents, mainContents: contents, trustedURL, isMainFrame: true, permission: "clipboard-sanitized-write" };
    expect(allowRendererPermission({ ...frame, isMainFrame: false })).toBe(false);
    expect(allowRendererPermission({ ...frame, mainContents: { getURL: () => trustedURL } })).toBe(false);
    expect(allowRendererPermission({ ...frame, contents: null })).toBe(false);
    expect(allowRendererPermission({ ...frame, trustedURL: null })).toBe(false);
    expect(allowRendererPermission({ ...frame, trustedURL: "file:///other/index.html" })).toBe(false);
  });
});
