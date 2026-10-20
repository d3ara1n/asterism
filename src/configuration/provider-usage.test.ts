import { describe, expect, it, vi } from "vitest";
import { waitForUsage, ProviderUsageQueries } from "./provider-usage.ts";
import { ProviderExtensions } from "./provider-extensions.ts";
import { RunLifecycle } from "../plugins/lifecycle.ts";

describe("用量查询取消边界", () => {
  // 等待开始前已取消时，也必须接管已创建 Promise 的拒绝，否则 Node 产生 unhandledRejection。
  it("已取消的等待仍接管异步拒绝", async () => {
    const reason = new Error("cancelled");
    const work = Promise.reject(new Error("credential failed"));
    await expect(waitForUsage(work, AbortSignal.abort(reason))).rejects.toBe(reason);
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  // query 捕获连接后在微任务中取凭据；关闭发生在两者之间时不应再访问 vault。
  it("立即关闭阻止尚未开始的凭据读取", async () => {
    const extensions = new ProviderExtensions(), lifecycle = new RunLifecycle(() => {});
    extensions.declare("test.provider", [{ id: "q", label: "Q", query: async () => [] }], [], lifecycle.group("call"));
    const credential = vi.fn(async () => { throw new Error("closed vault"); });
    const queries = new ProviderUsageQueries(extensions, () => ({ id: "p", name: "P", revision: 1,
      protocol: "openai-chat", baseUrl: "https://example.test", enabled: true, auth: "api_key", compatibility: [], usage: "q" }), credential);
    const pending = queries.query("p");
    queries.close();
    expect(await pending).toMatchObject({ state: "error", error: "unavailable", items: [] });
    expect(credential).not.toHaveBeenCalled();
    await lifecycle.close();
  });
});
