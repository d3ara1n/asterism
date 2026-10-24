import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { exaResponse, exaSearchOptions, exaWebProvider } from "./exa.ts";

// SDK 在模块加载时取用 fetch；提前替换保证请求验证始终留在本地。
const http = vi.hoisted(() => {
  const original = globalThis.fetch, transport = vi.fn<typeof fetch>();
  globalThis.fetch = transport;
  return { original, transport };
});
afterEach(() => http.transport.mockReset());
afterAll(() => { globalThis.fetch = http.original; });

describe("Exa 结果归一化", () => {
  // 注册表在调用 create 前去除尾斜杠；此处验证不含尾斜杠的代理地址能正确路由 search 与 contents 路径。
  it("代理端点下仍请求准确的 search 与 contents 路径", async () => {
    const paths: string[] = [];
    http.transport.mockImplementation(async url => {
      paths.push(new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).pathname);
      return new Response(JSON.stringify({ results: [{ id: "page", url: "https://page.test/", text: "Page content" }] }),
        { headers: { "content-type": "application/json" } });
    });
    const instance = exaWebProvider.create({ baseUrl: "https://proxy.test/exa", credential: "test-key" });
    const options = { signal: new AbortController().signal };
    await instance.search!({ query: "test", maxResults: 1 }, options);
    await instance.fetch!({ url: "https://page.test/" }, options);
    expect(paths).toEqual(["/exa/search", "/exa/contents"]);
  });
  // Exa text、highlights、summary 含义不同；合并成单个 content 会把生成摘要伪装成原文。
  it("分别保留正文、摘录、摘要与具型来源数据", () => {
    const result = exaResponse({ requestId: "request-1", results: [{ id: "source-1", url: "https://example.test/page", title: "Title",
      text: "Original body", highlights: ["Relevant passage"], summary: { finding: "Generated summary" }, author: "Author",
      publishedDate: "2026-01-01", score: 0.8, snapshotAt: "2026-01-02T00:00:00Z", entities: [{ type: "company", properties: { name: "Example" } }],
    }], costDollars: { total: 0.005, contents: { text: 0.001 } } });
    expect(result.documents[0]?.content).toEqual([
      { kind: "body", format: "text", text: "Original body" },
      { kind: "excerpt", format: "text", text: "Relevant passage" },
      { kind: "summary", format: "text", text: '{"finding":"Generated summary"}' },
    ]);
    expect(result.documents[0]).toMatchObject({ dates: [{ kind: "published", value: "2026-01-01" }], author: "Author", score: 0.8,
      details: [{ contract: { id: "atelier.builtin/web.exa.document" }, data: { id: "source-1", snapshotAt: "2026-01-02T00:00:00Z",
        entities: [{ type: "company", properties: { name: "Example" } }], summary: { finding: "Generated summary" } } }] });
    expect(result.usage).toEqual([{ name: "total", amount: 0.005, unit: "currency", currency: "USD" }]);
    expect(result.details?.[0]?.data).toMatchObject({ costDollars: { total: 0.005, contents: { text: 0.001 } } });
  });
  // 服务端可能放宽查询或忽略字段，即使 HTTP 成功也必须将语义差异交给模型。
  it("合并本地未支持条件与服务端过滤说明，保留内容获取失败", () => {
    const { options, hints } = exaSearchOptions({ query: "test", maxResults: 200, language: "zh", publishedAfter: "2026-01-01" });
    expect(options.numResults).toBe(100);
    expect(options.startPublishedDate).toBe("2026-01-01");
    const result = exaResponse({ results: [], notices: [{ code: "RESTRICTIONS_RELAXED", path: "/query", message: "The exact phrase restriction was relaxed." }],
      warnings: [{ code: "IGNORED_FIELD", path: "/startPublishedDate", message: "Date filtering was not applied." }],
      statuses: [{ id: "https://example.test/page", status: "error", error: { tag: "CRAWL_NOT_FOUND" } }],
    }, hints);
    expect(result.hints.map(hint => [hint.code, hint.parameter])).toEqual([
      ["unsupported_parameter", "language"], ["parameter_adjusted", "maxResults"],
      ["IGNORED_FIELD", "publishedAfter"], ["RESTRICTIONS_RELAXED", "query"], ["content_unavailable", undefined],
    ]);
    expect(result.hints.at(-1)?.message).toContain("CRAWL_NOT_FOUND");
    expect(result.usage).toBeUndefined();
  });
});
