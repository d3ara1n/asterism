import { describe, expect, it } from "vitest";
import { primaryQuota, quotaRemaining, usageItemsSchema, type QuotaItem } from "./provider-usage.ts";

const quota = (id: string, durationMs: number | null, resetAt: number): QuotaItem => ({
  id, label: id, type: "quota", scope: "plan", value: { type: "ratio", remaining: 0.6 },
  window: { mode: "rolling", durationMs, resetAt },
});
describe("账户用量公共结果", () => {
  // 最短周期是 toolbar 选择依据；周窗口即将重置不能替代五小时窗口。
  it("按周期长度选主窗口，比例与绝对数量统一消费，余额可同时存在", () => {
    const weekly = quota("week", 604800000, 1), rolling = quota("5h", 18000000, 999999);
    rolling.value = { type: "quantity", remaining: 25, limit: 100, unit: "requests" };
    const items = usageItemsSchema.parse([
      { id: "wallet", type: "balance", scope: "account", label: "Balance", currency: "CNY", remaining: -2 },
      quota("unknown", null, 0), weekly, rolling,
    ]);
    expect(primaryQuota(items)?.id).toBe("5h");
    expect(quotaRemaining(primaryQuota(items)!)).toBe(0.25);
    expect(quotaRemaining(weekly)).toBe(0.6);
    expect(primaryQuota(items.slice(0, 1))).toBeNull();
  });
  // 数据边界拒绝不可展示的矛盾结果，不用 UI 钳位伪装成有效额度。
  it("拒绝重复身份、无效比例与剩余量超过限额", () => {
    const item = quota("test", 1000, 1000);
    expect(usageItemsSchema.safeParse([item, item]).success).toBe(false);
    expect(usageItemsSchema.safeParse([{ ...item, value: { type: "ratio", remaining: 1.1 } }]).success).toBe(false);
    expect(usageItemsSchema.safeParse([{ ...item, value: { type: "quantity", remaining: 2, limit: 1, unit: "tokens" } }]).success).toBe(false);
  });
});
