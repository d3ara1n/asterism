import { describe, expect, it } from "vitest";
import { matchesWebUrl, matchWebProvider } from "./web-providers.ts";

const types = [
  { id: "specific", fetch: true, urlPatterns: ["https://other.test/*", "https://docs.test/*"] },
  { id: "generic", fetch: true, urlPatterns: ["*"] },
  { id: "search", fetch: false, urlPatterns: ["*"] },
];
const state = (id: string, enabled = true) => ({ id, enabled });
describe("Web URL 路由", () => {
  // 查询字符串中的 ?、+ 与域名中的 . 是字面量，否则 glob 会误选提供方。
  it("只将星号视为通配符，其他 URL 字符按字面匹配", () => {
    expect(matchesWebUrl("https://docs.test/page?v=a+b", "https://docs.test/page?v=a+b")).toBe(true);
    expect(matchesWebUrl("https://docs.test/*", "https://docsXtest/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test.evil/page")).toBe(false);
    expect(matchesWebUrl("https://docs.test/*", "https://docs.test/a?x=1")).toBe(true);
  });
  // 每个提供方类型至多一份状态；状态顺序决定首个命中。
  it("遍历全部 patterns，状态顺序决定首个命中", () => {
    const ordered = [state("specific"), state("generic")];
    expect(matchWebProvider(ordered, types, "https://docs.test/page")).toBe("specific");
    expect(matchWebProvider([...ordered].reverse(), types, "https://docs.test/page")).toBe("generic");
    expect(matchWebProvider(ordered, types, "https://news.test/page")).toBe("generic");
  });
  // 停用与仅搜索提供方不能拦截 URL；缺少匹配明确返回空。
  it("跳过不可用能力，未命中时不任意挑选提供方", () => {
    const states = [state("generic", false), state("search"), state("specific")];
    expect(matchWebProvider(states, types, "https://docs.test/page")).toBe("specific");
    expect(matchWebProvider(states, types, "https://news.test/page")).toBeNull();
  });
});
