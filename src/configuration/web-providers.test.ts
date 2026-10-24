import { describe, expect, it } from "vitest";
import { matchesWebUrl, matchWebProvider } from "./web-providers.ts";

const types = [
  { id: "specific", fetch: true, urlPatterns: ["https://other.test/*", "https://docs.test/*"] },
  { id: "generic", fetch: true, urlPatterns: ["*"] },
  { id: "search", fetch: false, urlPatterns: ["*"] },
];
const connection = (id: string, type: string, enabled = true) => ({ id, type, enabled });
describe("Web URL 路由", () => {
  // 查询字符串中的 ?、+ 与域名中的 . 是字面量，否则 glob 会误选提供方。
  it("只将星号视为通配符，其他 URL 字符按字面匹配", () => {
    expect(matchesWebUrl("https://docs.test/page?v=a+b", "https://docs.test/page?v=a+b")).toBe(true);
    expect(matchesWebUrl("https://docs.test/*", "https://docsXtest/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test.evil/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test/a?x=1")).toBe(true);
  });
  // 专用提供方的第二个 pattern 也应命中；只有列表顺序决定优先级，不按特异性重新排序。
  it("遍历全部 patterns，连接顺序决定首个命中", () => {
    const ordered = [connection("docs", "specific"), connection("web", "generic")];
    expect(matchWebProvider(ordered, types, "https://docs.test/page")).toBe("docs");
    expect(matchWebProvider([...ordered].reverse(), types, "https://docs.test/page")).toBe("web");
    expect(matchWebProvider(ordered, types, "https://news.test/page")).toBe("web");
  });
  // 停用、类型撤销和仅搜索连接均不能拦截 URL；缺少匹配明确返回空。
  it("跳过不可用能力，未命中时不任意挑选连接", () => {
    const connections = [connection("off", "generic", false), connection("missing", "removed"), connection("search", "search"), connection("docs", "specific")];
    expect(matchWebProvider(connections, types, "https://docs.test/page")).toBe("docs");
    expect(matchWebProvider(connections, types, "https://news.test/page")).toBeNull();
  });
});
