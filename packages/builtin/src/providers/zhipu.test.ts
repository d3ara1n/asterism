import { describe, expect, it, vi } from "vitest";
import { createZhipuUsage, parseZhipuQuota } from "./zhipu.ts";

// 依据 AstrLink decodeGLM 与已采集接口：3=小时，6=每周（number 有 1/7），percentage 为已用百分比。
const sample = { data: { limits: [
  { type: "CREDIT_LIMIT", unit: 6, number: 7, percentage: 20, nextResetTime: 1790000000000 },
  { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 75, nextResetTime: 1789900000000 },
  { type: "TIME_LIMIT", unit: 5, number: 1, percentage: 10 },
] } };
describe("智谱 Coding Plan 查询", () => {
  it("映射 token/credit 窗口的剩余比例，周数不受 number 漂移影响，其他工具预算不混入", () => {
    const result = parseZhipuQuota(sample);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "quota", value: { type: "ratio", remaining: 0.8 }, window: { durationMs: 604800000, resetAt: 1790000000000 } });
    expect(result[1]).toMatchObject({ value: { type: "ratio", remaining: 0.25 }, window: { durationMs: 18000000 } });
    expect(parseZhipuQuota({ data: { limits: [{ ...sample.data.limits[0], number: 1 }] } })[0]).toMatchObject({ window: { durationMs: 604800000 } });
    expect(parseZhipuQuota({ data: { limits: [{ type: "TOKENS_LIMIT", unit: 99, percentage: 100 }] } })[0])
      .toMatchObject({ value: { remaining: 0 }, window: { durationMs: null, resetAt: null } });
    expect(() => parseZhipuQuota({ data: { limits: [{ type: "TOKENS_LIMIT" }] } })).toThrow();
  });
  // 明确选择的查询沿当前连接 origin；认证口径与推理协议无关，禁止重定向转交 key。
  it("使用当前站点的根路径与裸 Authorization key，错误只返回类别", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(sample));
    const provider = createZhipuUsage(transport);
    const signal = new AbortController().signal;
    await provider.query({ connection: { id: "renamed", endpoint: "https://relay.test/proxy/v1" }, credential: "test-key", signal });
    expect(String(transport.mock.calls[0]![0])).toBe("https://relay.test/api/monitor/usage/quota/limit");
    expect(transport.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: "test-key" }, redirect: "error", signal });
    transport.mockResolvedValueOnce(new Response("private response", { status: 401 }));
    await expect(provider.query({ connection: { id: "p", endpoint: "https://relay.test" }, credential: "test-key", signal }))
      .rejects.toMatchObject({ code: "authentication" });
  });
});
