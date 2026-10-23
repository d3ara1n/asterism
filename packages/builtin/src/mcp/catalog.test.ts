import { describe, expect, it } from "vitest";
import { listCatalog, searchCatalog, toolIdentity, parseToolIdentity, parseCredentialLines, type CatalogServer } from "./catalog.ts";

function server(id: string, name: string, tools?: { name: string; description?: string }[]): CatalogServer {
  return { config: { id, name, description: `${name} service`, enabled: true, mode: "lazy", idleSeconds: 300, transport: "stdio", command: "server", args: [], cwd: "", url: "", auth: "none" },
    state: { id, name, description: `${name} service`, enabled: true, mode: "lazy", connection: "disconnected", indexed: tools !== undefined, toolCount: tools?.length ?? 0, error: null, authorizationUrl: null },
    ...(tools && { directory: { tools: tools.map(tool => ({ ...tool, inputSchema: { type: "object" } })) } }) };
}

describe("MCP 目录发现", () => {
  // 聚合服务器中工具名可重复；分隔符拼接会让不同目标碰撞。
  it("工具身份可还原包含分隔符和 Unicode 的目标", () => {
    expect(toolIdentity("a/b", "c")).not.toBe(toolIdentity("a", "b/c"));
    expect(parseToolIdentity(toolIdentity("服务", 'search/"issue"'))).toEqual(["服务", 'search/"issue"']);
  });
  // lazy 首次未发现的服务器不能被一个已有命中遮蔽，否则模型无法自行 connect。
  it("有工具命中时仍交付未索引服务器，空目录则视为已索引", () => {
    const result = searchCatalog([server("local", "Local", [{ name: "issue_search" }]), server("github", "GitHub"), server("empty", "Empty", [])], { query: "github/issue", offset: 0, limit: 20 });
    expect(result.matches.items.map(item => item.name)).toEqual(["issue_search"]);
    expect(result.unindexed_servers.items.map(item => item.server_id)).toEqual(["github"]);
    expect(result.coverage).toEqual({ indexed_servers: 2, unindexed_servers: 1 });
  });
  // 长说明应参与检索但不随命中整段返回；工具名匹配优先于正文提及。
  it("搜索完整说明，返回有界摘要并优先工具名", () => {
    const result = searchCatalog([server("s", "Service", [{ name: "other", description: `${"x".repeat(600)} issue` }, { name: "get_issue", description: "Read a ticket" }])], { query: "issue", offset: 0, limit: 1 });
    expect(result.matches.items[0]?.name).toBe("get_issue");
    expect(result.matches.next_offset).toBe(1);
    const next = searchCatalog([server("s", "Service", [{ name: "other", description: `${"x".repeat(600)} issue` }])], { query: "issue", offset: 0, limit: 20 });
    expect(next.matches.total).toBe(1);
    expect(next.matches.items[0]?.description).toHaveLength(240);
    expect(next.matches.items[0]).not.toHaveProperty("inputSchema");
  });
  // list 用于浏览，不能无界展开大型工具目录；停用服务器不参与 search。
  it("工具分页可继续浏览且搜索排除停用服务器", () => {
    const enabled = server("a", "A", [{ name: "one" }, { name: "two" }]);
    const disabled = server("b", "B", [{ name: "one" }]); disabled.config.enabled = false;
    expect(listCatalog([enabled], { server_id: "a", offset: 1, limit: 1 })).toMatchObject({ items: [{ name: "two" }], total: 2, next_offset: null });
    expect(searchCatalog([enabled, disabled], { query: "one", offset: 0, limit: 20 }).matches.items.map(item => item.server_id)).toEqual(["a"]);
  });
  // Token 的 base64 尾部和带等号的值应原样交付；错误行必须阻止表单保存。
  it("凭据行保留值中的等号和空白", () => {
    expect(parseCredentialLines("Authorization=Bearer abc==\nCUSTOM= a=b \n")).toEqual({ Authorization: "Bearer abc==", CUSTOM: " a=b " });
    expect(() => parseCredentialLines("missing separator")).toThrow("KEY=VALUE");
  });
});
