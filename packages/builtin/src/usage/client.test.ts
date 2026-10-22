import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageState } from "./contract.ts";
import { ProviderUsageClient, type UsageBridge } from "./client.ts";

const state: ProviderUsageState = { providerId: "p", usage: "quota", state: "ready", error: null,
  updatedAt: 1, items: [{ type: "balance", id: "balance", label: "Balance", scope: "account", remaining: 10, currency: "USD" }] };
const result = (usage = state) => usage;
afterEach(() => vi.useRealTimers());
describe("用量消费订阅", () => {
  // header 来源没有远端轮询；响应通知只重读对应连接，不刷新其他账户或模型目录。
  it("响应头来源等待事件，不定时轮询且只更新通知的连接", async () => {
    vi.useFakeTimers();
    let changed!: (id?: string) => void;
    const execute = vi.fn<UsageBridge["query"]>(async providerId => result({
      ...state, providerId, source: "headers", state: "waiting", items: [], updatedAt: null,
    }));
    const client = new ProviderUsageClient({ query: execute, onChanged: listener => { changed = listener; return () => {}; } });
    try {
      client.subscribe("p", () => {}); client.subscribe("q", () => {});
      await Promise.all([client.refresh("p"), client.refresh("q")]);
      expect(execute).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(180_000);
      expect(execute).toHaveBeenCalledTimes(2);
      changed("p");
      await client.refresh("p");
      expect(execute).toHaveBeenCalledTimes(3);
      expect(execute.mock.lastCall?.[0]).toBe("p");
      expect(client.get("q")?.state).toBe("waiting");
    } finally { client.close(); }
  });
  // 多张卡片共享查询，离开页面/后台不继续轮询；剩余订阅仍正常刷新。
  it("同一连接共享请求，按订阅和窗口可见性管理轮询", async () => {
    vi.useFakeTimers();
    const execute = vi.fn<UsageBridge["query"]>(async () => result());
    const client = new ProviderUsageClient({ query: execute, onChanged: () => () => {} });
    try {
      const one = client.subscribe("p", () => {}), two = client.subscribe("p", () => {});
      await client.refresh("p");
      expect(execute).toHaveBeenCalledTimes(1);
      one();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(execute).toHaveBeenCalledTimes(2);
      client.setActive(false);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(execute).toHaveBeenCalledTimes(2);
      client.setActive(true);
      await client.refresh("p");
      expect(execute).toHaveBeenCalledTimes(3);
      two();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(execute).toHaveBeenCalledTimes(3);
    } finally { client.close(); }
  });
  // 通知发生在读取期间时合并重读意图；每个连接保持一个在途请求，结果按返回顺序应用。
  it("读取期间收到通知，先应用返回结果，再查询一次当前值", async () => {
    let changed!: () => void, finish!: (value: ProviderUsageState) => void;
    const execute = vi.fn<UsageBridge["query"]>()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(result({ ...state, items: [] }));
    const client = new ProviderUsageClient({ query: execute, onChanged: listener => { changed = listener; return () => {}; } });
    try {
      client.subscribe("p", () => {});
      const old = client.refresh("p");
      await Promise.resolve();
      changed();
      expect(client.get("p")).toBeNull();
      expect(execute).toHaveBeenCalledTimes(1);
      finish(result()); await old;
      await vi.waitFor(() => expect(client.get("p")).toMatchObject({ items: [] }));
      expect(execute).toHaveBeenCalledTimes(2);
      expect(client.get("p")).toMatchObject({ items: [] });
    } finally { client.close(); }
  });
});
