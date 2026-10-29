import { describe, expect, it } from "vitest";
import { mcpToolIdentity, parseMcpToolIdentity } from "./mcp.ts";

describe("MCP tool identity", () => {
  it("retains delimiters within remote tool names", () => {
    expect(parseMcpToolIdentity(mcpToolIdentity("github", "repos/search"))).toEqual(["github", "repos/search"]);
  });
  it("rejects incomplete handles and invalid server identifiers", () => {
    for (const value of ["search", "/search", "github/", "GitHub/search", '["github","search"]'])
      expect(() => parseMcpToolIdentity(value)).toThrow("server_id/tool_name");
  });
});
