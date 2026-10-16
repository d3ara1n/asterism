import { describe, expect, it } from "vitest";
import { externalWebUrl } from "./links.ts";

describe("模型生成链接的外部打开边界", () => {
  it("允许标准网页 URL，保留查询与锚点", () => {
    expect(externalWebUrl("https://example.com/docs?q=hello#usage")).toBe("https://example.com/docs?q=hello#usage");
    expect(externalWebUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });
  it("拒绝脚本、本机文件、外部应用协议、相对路径与嵌入凭据", () => {
    for (const value of ["javascript:alert(1)", "file:///etc/passwd", "vscode://file/path", "data:text/html,hello", "/local", "https://user:secret@example.com"]) {
      expect(externalWebUrl(value)).toBeNull();
    }
  });
});
