import { describe, expect, it } from "vitest";
import { listCatalog, searchCatalog, toolIdentity, parseToolIdentity, parseCredentialLines, parseArgumentLines, slugifyServerId, type CatalogServer } from "./catalog.ts";

function server(id: string, name: string, tools?: { name: string; description?: string }[]): CatalogServer {
  return { config: { id, name, enabled: true, mode: "lazy", idleSeconds: 300, transport: "stdio", command: "server", args: [], cwd: "", url: "", auth: "none" },
    state: { id, name, enabled: true, mode: "lazy", connection: "disconnected", indexed: tools !== undefined, toolCount: tools?.length ?? 0, error: null, authorizationUrl: null },
    ...(tools && { directory: { tools: tools.map(tool => ({ ...tool, inputSchema: { type: "object" } })) } }) };
}

describe("MCP 工具身份", () => {
  // 服务器 ID 不含 `/`，远端工具名可以含 `/`；按第一个 `/` 切分才能还原聚合服务器的工具名。
  it("按第一个分隔符还原服务器 ID 与含分隔符的工具名", () => {
    expect(parseToolIdentity(toolIdentity("github", "repos/search"))).toEqual(["github", "repos/search"]);
  });
  // 缺少服务器或工具部分、服务器部分不符合 ID 规则时，调用不能落到错误的服务器上。
  it("拒绝缺少任一部分或服务器 ID 非法的句柄", () => {
    for (const value of ["search", "/search", "github/", "GitHub/search", '["github","search"]'])
      expect(() => parseToolIdentity(value)).toThrow("server_id/tool_name");
  });
  // 默认 ID 由名称生成；重名时不能静默覆盖另一台服务器，无法转写的名称也要得到合法 ID。
  it("由名称生成合法 ID 并避开已有 ID", () => {
    expect(slugifyServerId("GitHub Enterprise", [])).toBe("github-enterprise");
    expect(slugifyServerId("GitHub", ["github", "github-2"])).toBe("github-3");
    expect(slugifyServerId("文件系统", [])).toBe("server");
  });
});

describe("MCP 目录发现", () => {
  // lazy 首次未发现的服务器不能被一个已有命中遮蔽，否则模型无法自行 connect。
  it("有工具命中时仍交付未索引服务器，空目录则视为已索引", () => {
    const result = searchCatalog([server("local", "Local", [{ name: "issue_search" }]), server("github", "GitHub"), server("empty", "Empty", [])], { query: "github issue", offset: 0, limit: 20 });
    expect(result.matches.items.map(item => item.tool_id)).toEqual(["local/issue_search"]);
    expect(result.unindexed_servers.map(item => item.server_id)).toEqual(["github"]);
    expect(result.coverage).toEqual({ indexed_servers: 2, unindexed_servers: 1 });
  });
  // 工具命中翻页时，未索引候选不能随工具 offset 被跳过或重复，只在第一页交付。
  it("未索引服务器只随第一页交付，不受工具分页偏移影响", () => {
    const servers = [server("a", "A", [{ name: "one" }, { name: "two" }]), server("b", "B"), server("c", "C")];
    const first = searchCatalog(servers, { query: "one two", offset: 0, limit: 1 });
    expect(first.unindexed_servers.map(item => item.server_id)).toEqual(["b"]);
    expect(first.coverage.unindexed_servers).toBe(2);
    const next = searchCatalog(servers, { query: "one two", offset: 1, limit: 1 });
    expect(next.matches.items).toHaveLength(1);
    expect(next.unindexed_servers).toEqual([]);
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
});

describe("MCP 表单解析", () => {
  // Token 的 base64 尾部和带等号的值应原样交付；错误行必须阻止表单保存。
  it("凭据行保留值中的等号和空白", () => {
    expect(parseCredentialLines("Authorization=Bearer abc==\nCUSTOM= a=b \n")).toEqual({ Authorization: "Bearer abc==", CUSTOM: " a=b " });
    expect(() => parseCredentialLines("missing separator")).toThrow("KEY=VALUE");
  });
  // 文本末尾换行会被当成一个空 argv 传给服务器；中间空行是用户显式的空参数。
  it("参数行去掉末尾空行，保留中间的空参数", () => {
    expect(parseArgumentLines("-y\n@scope/server\n\n")).toEqual(["-y", "@scope/server"]);
    expect(parseArgumentLines("--flag\n\n--next")).toEqual(["--flag", "", "--next"]);
    expect(parseArgumentLines("")).toEqual([]);
  });
});
