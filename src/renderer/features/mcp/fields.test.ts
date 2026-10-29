import { describe, expect, it } from "vitest";
import { parseArgumentLines, parseCredentialLines, slugifyServerId } from "./form.ts";

describe("MCP form field parsing", () => {
  it("generates server identities without colliding with existing entries", () => {
    expect(slugifyServerId("GitHub Enterprise", [])).toBe("github-enterprise");
    expect(slugifyServerId("GitHub", ["github", "github-2"])).toBe("github-3");
    expect(slugifyServerId("文件系统", [])).toBe("server");
  });
  it("preserves equals signs and whitespace within credential values", () => {
    expect(parseCredentialLines("Authorization=Bearer abc==\nCUSTOM= a=b \n")).toEqual({ Authorization: "Bearer abc==", CUSTOM: " a=b " });
    expect(() => parseCredentialLines("missing separator")).toThrow("KEY=VALUE");
  });
  it("removes trailing line breaks while retaining explicit empty arguments", () => {
    expect(parseArgumentLines("-y\n@scope/server\n\n")).toEqual(["-y", "@scope/server"]);
    expect(parseArgumentLines("--flag\n\n--next")).toEqual(["--flag", "", "--next"]);
    expect(parseArgumentLines("")).toEqual([]);
  });
});
