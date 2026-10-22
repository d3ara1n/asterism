import { describe, expect, it, vi } from "vitest";
import type { ModelResponse, UsageItem } from "@atelier/sdk/contracts";
import { UsageQueryError, type ProviderInfo, type ProviderServices, type UsageProvider, type UsageServices } from "@atelier/sdk/runtime";
import { waitForUsage, UsageConsumer } from "./service.ts";

const items: UsageItem[] = [{ id: "quota", label: "Quota", scope: "connection", type: "quota", category: "rate_limit",
  value: { type: "ratio", remaining: 0.4 }, window: { mode: "unknown", durationMs: null, resetAt: null } }];
function setup(provider: UsageProvider) {
  let connection: ProviderInfo = { id: "p", name: "P", protocol: "openai-chat", baseUrl: "https://example.test/v1",
    auth: "api_key", enabled: true, compatibility: [], usage: provider.id };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const credential = vi.fn(async () => "private-key");
  const providers: ProviderServices = { list: () => [connection], get: () => connection, presets: () => [], credential, subscribe };
  const usages: UsageServices = { list: () => [], get: () => provider, subscribe };
  const changed = vi.fn();
  const usage = new UsageConsumer(providers, usages, changed);
  return { usage, credential, changed, response: (): ModelResponse => ({ connection: { id: connection.id },
    endpoint: connection.baseUrl, model: "model", receivedAt: Date.now(), status: 429, headers: { quota: "yes" } }),
    change(next = provider) {
      provider = next;
      connection = { ...connection, baseUrl: "https://new.test/v1", usage: provider.id };
      for (const listener of listeners) listener();
    } };
}

describe("内置用量消费者", () => {
  // 已取消等待仍需接管原 Promise 的拒绝，避免 unhandledRejection。
  it("已取消的等待仍接管异步拒绝", async () => {
    const reason = new Error("cancelled");
    await expect(waitForUsage(Promise.reject(new Error("credential failed")), AbortSignal.abort(reason))).rejects.toBe(reason);
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  // 关闭发生在排队查询与取凭据之间，不能再访问凭据服务。
  it("立即关闭阻止尚未开始的凭据读取", async () => {
    const fixture = setup({ id: "q", label: "Q", query: async () => [] });
    const pending = fixture.usage.query("p");
    fixture.usage.close();
    expect(await pending).toMatchObject({ state: "error", error: "unavailable", items: [] });
    expect(fixture.credential).not.toHaveBeenCalled();
  });
  // 被动来源读取不取凭据；null 保留，空列表清空；解析错误不影响 Agent 消费模型结果。
  it("调用者交付响应后更新，无数据保留，错误保留实报且隔离失败", async () => {
    const parseHeaders = vi.fn((): UsageItem[] | null => items);
    const fixture = setup({ id: "headers", label: "Headers", source: "headers", parseHeaders });
    try {
      expect(await fixture.usage.query("p", { refresh: true })).toMatchObject({ state: "waiting", items: [] });
      fixture.usage.consume(fixture.response());
      const first = await fixture.usage.query("p");
      expect(first).toMatchObject({ source: "headers", model: "model", state: "ready", items });
      expect(fixture.credential).not.toHaveBeenCalled();
      expect(parseHeaders.mock.calls[0]).toEqual([expect.objectContaining({ status: 429, headers: { quota: "yes" } })]);
      parseHeaders.mockReturnValueOnce(null);
      fixture.usage.consume(fixture.response());
      expect(await fixture.usage.query("p")).toEqual(first);
      parseHeaders.mockImplementationOnce(() => { throw new UsageQueryError("protocol"); });
      expect(() => fixture.usage.consume(fixture.response())).not.toThrow();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "error", error: "protocol", items });
      parseHeaders.mockReturnValueOnce([]);
      fixture.usage.consume(fixture.response());
      expect(await fixture.usage.query("p")).toMatchObject({ state: "ready", items: [] });
    } finally { fixture.usage.close(); }
  });
  // 响应按连接当前 usage 消费；请求取用的端点变化不使返回结果失效。
  it("连接变化清空缓存，迟到响应仍按当前目录消费", async () => {
    const parseHeaders = vi.fn(() => items);
    const fixture = setup({ id: "headers", label: "Headers", source: "headers", parseHeaders });
    try {
      const response = fixture.response();
      fixture.change();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "waiting", items: [] });
      fixture.usage.consume(response);
      expect(parseHeaders).toHaveBeenCalledOnce();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "ready", items });
    } finally { fixture.usage.close(); }
  });
  // 迟到的查询状态可以写回缓存，但新响应必须声明本次实际使用的 headers 来源，避免继续轮询。
  it("查询切换到响应头来源后，新响应更新来源元数据", async () => {
    let finish!: (value: UsageItem[]) => void;
    const query = vi.fn(() => new Promise<UsageItem[]>(resolve => { finish = resolve; }));
    const fixture = setup({ id: "query-provider", label: "Query", query });
    try {
      const pending = fixture.usage.query("p");
      await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
      fixture.change({ id: "header-provider", label: "Headers", source: "headers", parseHeaders: () => items });
      finish(items);
      await pending;
      fixture.usage.consume(fixture.response());
      expect(await fixture.usage.query("p")).toMatchObject({
        state: "ready", usage: "header-provider", source: "headers", items,
      });
    } finally { fixture.usage.close(); }
  });
});
