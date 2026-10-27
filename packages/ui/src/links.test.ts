import { describe, expect, it } from "vitest";
import { externalWebUrl } from "./links.ts";

describe("External opening boundary for model-generated links", () => {
  it("allows standard web URLs and preserves queries and fragments", () => {
    expect(externalWebUrl("https://example.com/docs?q=hello#usage")).toBe("https://example.com/docs?q=hello#usage");
    expect(externalWebUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });
  it("rejects scripts, local files, external application protocols, relative paths, and embedded credentials", () => {
    for (const value of ["javascript:alert(1)", "file:///etc/passwd", "vscode://file/path", "data:text/html,hello", "/local", "https://user:secret@example.com"]) {
      expect(externalWebUrl(value)).toBeNull();
    }
  });
});
