import { describe, expect, it } from "vitest";
import { listCatalog, searchCatalog } from "./catalog.ts";
import type { McpCatalogServer as CatalogServer } from "@asterism-app/sdk/contracts";

function server(id: string, name: string, tools?: { name: string; description?: string }[]): CatalogServer {
  return { config: { id, name, enabled: true, mode: "lazy", idleSeconds: 300, transport: "stdio", command: "server", args: [], cwd: "", url: "", auth: "none" },
    state: { id, name, enabled: true, mode: "lazy", connection: "disconnected", indexed: tools !== undefined, toolCount: tools?.length ?? 0, error: null, authorizationUrl: null, authorizationExpiresAt: null },
    ...(tools && { directory: { tools: tools.map(tool => ({ ...tool, inputSchema: { type: "object" } })) } }) };
}

describe("MCP catalog discovery", () => {
  // An existing tool match must not hide lazy servers that have not yet been discovered, or the model cannot connect to them itself.
  it("Returns unindexed servers even when tools match, and treats an empty catalog as indexed", () => {
    const result = searchCatalog([server("local", "Local", [{ name: "issue_search" }]), server("github", "GitHub"), server("empty", "Empty", [])], { query: "github issue", offset: 0, limit: 20 });
    expect(result.matches.items.map(item => item.tool_id)).toEqual(["local/issue_search"]);
    expect(result.unindexed_servers.map(item => item.server_id)).toEqual(["github"]);
    expect(result.coverage).toEqual({ indexed_servers: 2, unindexed_servers: 1 });
  });
  // When paginating tool matches, unindexed candidates must not be skipped or repeated because of the tool offset; return them only on the first page.
  it("Returns unindexed servers only on the first page, independently of tool pagination offsets", () => {
    const servers = [server("a", "A", [{ name: "one" }, { name: "two" }]), server("b", "B"), server("c", "C")];
    const first = searchCatalog(servers, { query: "one two", offset: 0, limit: 1 });
    expect(first.unindexed_servers.map(item => item.server_id)).toEqual(["b"]);
    expect(first.coverage.unindexed_servers).toBe(2);
    const next = searchCatalog(servers, { query: "one two", offset: 1, limit: 1 });
    expect(next.matches.items).toHaveLength(1);
    expect(next.unindexed_servers).toEqual([]);
  });
  // Long descriptions should participate in search without being returned in full with matches; tool-name matches take precedence over mentions in the body.
  it("Searches full descriptions, returns bounded summaries, and prioritizes tool names", () => {
    const result = searchCatalog([server("s", "Service", [{ name: "other", description: `${"x".repeat(600)} issue` }, { name: "get_issue", description: "Read a ticket" }])], { query: "issue", offset: 0, limit: 1 });
    expect(result.matches.items[0]?.name).toBe("get_issue");
    expect(result.matches.next_offset).toBe(1);
    const next = searchCatalog([server("s", "Service", [{ name: "other", description: `${"x".repeat(600)} issue` }])], { query: "issue", offset: 0, limit: 20 });
    expect(next.matches.total).toBe(1);
    expect(next.matches.items[0]?.description).toHaveLength(240);
    expect(next.matches.items[0]).not.toHaveProperty("inputSchema");
  });
  // list supports browsing and must not expand large tool catalogs without bounds; disabled servers do not participate in search.
  it("Tool pagination supports continued browsing, and search excludes disabled servers", () => {
    const enabled = server("a", "A", [{ name: "one" }, { name: "two" }]);
    const disabled = server("b", "B", [{ name: "one" }]); disabled.config.enabled = false;
    expect(listCatalog([enabled], { server_id: "a", offset: 1, limit: 1 })).toMatchObject({ items: [{ name: "two" }], total: 2, next_offset: null });
    expect(searchCatalog([enabled, disabled], { query: "one", offset: 0, limit: 20 }).matches.items.map(item => item.server_id)).toEqual(["a"]);
  });
});
