import { describe, expect, it } from "vitest";
import { allowRendererPermission } from "./permissions.ts";

describe("主窗口浏览器权限", () => {
  // docs/architecture.md#安全边界与非目标：复制要求放行写入，开发 URL 与发布 file URL 都须可用。
  it.each(["http://127.0.0.1:5173/", "file:///app/renderer/index.html"])("受信主框架可写剪贴板并枚举字体：%s", trustedURL => {
    const contents = { getURL: () => `${trustedURL}#workbench` };
    const frame = { contents, mainContents: contents, trustedURL, isMainFrame: true };
    expect(allowRendererPermission({ ...frame, permission: "clipboard-sanitized-write" })).toBe(true);
    expect(allowRendererPermission({ ...frame, permission: "local-fonts" })).toBe(true);
    expect(allowRendererPermission({ ...frame, permission: "clipboard-read" })).toBe(false);
    expect(allowRendererPermission({ ...frame, permission: "media" })).toBe(false);
  });

  // 只开放既有受信窗口范围，不能因允许复制而授权子框架、其他窗口或导航后的页面。
  it("剪贴板写入仍受窗口身份、主框架和页面 URL 约束", () => {
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
