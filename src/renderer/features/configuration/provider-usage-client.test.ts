import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageState } from "@atelier/sdk/contracts";
import type { ConfigurationBridge, ConfigurationResult } from "../../../shared/configuration.ts";
import { ProviderUsageClient } from "./provider-usage-client.ts";

const state: ProviderUsageState = { providerId: "p", revision: 1, usage: "quota", state: "ready", error: null,
  updatedAt: 1, items: [{ type: "balance", id: "balance", label: "Balance", scope: "account", remaining: 10, currency: "USD" }] };
const result = (usage = state): ConfigurationResult => ({ ok: true, savedId: null, snapshot: {} as never, usage });
afterEach(() => vi.useRealTimers());
describe("用量消费订阅", () => {
  // 多张卡片共享查询，离开页面/后台不继续轮询；剩余订阅仍正常刷新。
  it("同一连接共享请求，按订阅和窗口可见性管理轮询", async () => {
    vi.useFakeTimers();
    const execute = vi.fn<ConfigurationBridge["execute"]>(async () => result());
    const client = new ProviderUsageClient({ execute, onChanged: () => () => {} });
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
  // 换凭据后旧 IPC 可以迟到；订阅端必须清掉旧账户数据，拒绝旧读取覆盖。
  it("配置变化后切换到新修订，旧读取不能重新显示旧余额", async () => {
    let changed!: () => void, finish!: (value: ConfigurationResult) => void;
    const execute = vi.fn<ConfigurationBridge["execute"]>()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(result({ ...state, revision: 2, items: [] }));
    const client = new ProviderUsageClient({ execute, onChanged: listener => { changed = listener; return () => {}; } });
    try {
      client.subscribe("p", () => {});
      const old = client.refresh("p");
      await Promise.resolve();
      changed();
      expect(client.get("p")).toBeNull();
      await client.refresh("p");
      finish(result()); await old;
      expect(client.get("p")).toMatchObject({ revision: 2, items: [] });
    } finally { client.close(); }
  });
});
