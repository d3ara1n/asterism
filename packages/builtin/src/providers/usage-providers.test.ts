import { describe, expect, it, vi } from "vitest";
import { usageItemsSchema } from "@atelier/sdk/contracts";
import { createDeepSeekUsage, parseDeepSeekBalance } from "./deepseek.ts";
import { createKimiUsage, parseKimiQuota } from "./kimi.ts";
import { createOpenCodeUsage, parseOpenCodeQuota } from "./opencode.ts";
import { createMoonshotUsage, parseMoonshotBalance } from "./moonshot.ts";
import { createOpenRouterUsage, parseOpenRouterKey } from "./openrouter.ts";
import { createBuiltinUsageProviders } from "./runtime.ts";
import { providerPresets } from "./presets.ts";

const deepseek = { is_available: true, balance_infos: [
  { currency: "CNY", total_balance: "12.50", granted_balance: "2.50", topped_up_balance: "10.00" },
  { currency: "USD", total_balance: "-0.25" },
] };
const opencode = { usage: {
  rolling: { percent: 25, resetsAt: "2030-01-01T05:00:00Z" },
  weekly: { percent: 100 }, monthly: { percent: 10 },
} };
const kimi = {
  usage: { used: "40", limit: "1000", resetTime: "2030-01-07T00:00:00Z" },
  limits: [
    { window: { duration: "300", timeUnit: "TIME_UNIT_MINUTE" }, detail: { remaining: "85", limit: "100" } },
    { window: { duration: 1, timeUnit: "WEEK" }, detail: { used: 40, limit: 1000 } },
    { window: { duration: 1, timeUnit: "MONTH" }, detail: { used: 26, limit: 100 } },
  ],
};
const moonshot = { code: 0, status: true, data: { available_balance: 12.345, voucher_balance: 5, cash_balance: 7.345 } };
describe("内置余额与套餐查询", () => {
  // DeepSeek 官方余额接口按币种提供 total_balance；不能只取首行或重复加赠金。
  it("保留每种币种的余额与欠费，拒绝把空金额当零", () => {
    expect(usageItemsSchema.parse(parseDeepSeekBalance(deepseek))).toMatchObject([
      { id: "balance-CNY", remaining: 12.5, currency: "CNY", scope: "account" },
      { id: "balance-USD", remaining: -0.25, currency: "USD" },
    ]);
    expect(() => parseDeepSeekBalance({ balance_infos: [{ currency: "USD", total_balance: "" }] })).toThrow();
  });
  // Moonshot 官方国内与国际文档分别规定 CNY/USD，响应不携带币种；子余额不能重复求和。
  it("Moonshot 按所选地区保留币种和可用总余额，拒绝业务错误", () => {
    expect(parseMoonshotBalance(moonshot, "CNY")).toMatchObject([{ remaining: 12.345, currency: "CNY" }]);
    expect(parseMoonshotBalance(moonshot, "USD")).toMatchObject([{ remaining: 12.345, currency: "USD" }]);
    expect(() => parseMoonshotBalance({ ...moonshot, code: 1, status: false }, "USD")).toThrow();
  });
  // /key 普通密钥可用；/credits 明确要求 management key，不应把权限失败当余额为零。
  it("OpenRouter 普通 key 只查预算，管理 key 才查询账户余额", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ data: { limit: 10, limit_remaining: 3, is_management_key: false } }));
    const provider = createOpenRouterUsage(transport);
    const context = { connection: { id: "router", endpoint: "https://relay.test/api/v1" }, credential: "test-key", signal: new AbortController().signal };
    expect(await provider.query(context)).toMatchObject([{ type: "balance", scope: "key", remaining: 3, currency: "USD" }]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0]![0])).toBe("https://relay.test/api/v1/key");
    transport.mockResolvedValueOnce(Response.json({ data: { limit: null, limit_remaining: null, is_management_key: true } }));
    transport.mockResolvedValueOnce(Response.json({ data: { total_credits: 30, total_usage: 12.5 } }));
    expect(await provider.query(context)).toMatchObject([{ type: "balance", scope: "account", remaining: 17.5 }]);
    expect(String(transport.mock.calls[2]![0])).toBe("https://relay.test/api/v1/credits");
    expect(parseOpenRouterKey({ data: { limit: null, limit_remaining: null } }).items).toEqual([]);
  });
  // effective_budget 是实际生效约束，周期预算需显示为 quota；月周期仍不伪造毫秒长度。
  it("OpenRouter 采用生效预算并保留周期与重置时间", () => {
    const raw = { data: { limit: 100, limit_remaining: 90, effective_budget: {
      limit_usd: 20, remaining_usd: 5, reset_interval: "monthly", resets_at: "2030-02-01T00:00:00Z",
    } } };
    expect(usageItemsSchema.parse(parseOpenRouterKey(raw).items)).toMatchObject([{
      type: "quota", scope: "key", value: { type: "quantity", remaining: 5, limit: 20, unit: "USD" },
      window: { durationMs: null, resetAt: Date.parse("2030-02-01T00:00:00Z") },
    }]);
  });
  // Go 接口返回已用百分比；月窗口不转换成固定 30 天，100% 仍是合法耗尽窗口。
  it("OpenCode 转换三个窗口的剩余比例，保留已耗尽窗口和未知重置时间", () => {
    expect(usageItemsSchema.parse(parseOpenCodeQuota(opencode))).toMatchObject([
      { id: "rolling", value: { remaining: 0.75 }, window: { durationMs: 18000000, resetAt: Date.parse("2030-01-01T05:00:00Z") } },
      { id: "weekly", value: { remaining: 0 }, window: { resetAt: null } },
      { id: "monthly", value: { remaining: 0.9 }, window: { durationMs: null } },
    ]);
    expect(() => parseOpenCodeQuota({ usage: { rolling: { percent: "unknown" } } })).toThrow();
  });
  // Kimi CLI 形状：周汇总 + limits；数字字符串、remaining 和等价周期不能导致重复或错误分母。
  it("Kimi 保留绝对额度并去重周窗口，自然月不伪造时长", () => {
    expect(usageItemsSchema.parse(parseKimiQuota(kimi))).toMatchObject([
      { id: "window-10080", value: { type: "quantity", remaining: 960, limit: 1000 } },
      { id: "window-300", value: { remaining: 85, limit: 100 }, window: { durationMs: 18000000 } },
      { id: "window-MONTH-1", value: { remaining: 74 }, window: { durationMs: null } },
    ]);
    expect(() => parseKimiQuota({ limits: [{ window: { duration: 5, timeUnit: "HOUR" }, detail: { limit: "100", remaining: "101" } }] })).toThrow();
    expect(() => parseKimiQuota({ error: "unauthorized" })).toThrow();
  });
  // 查询沿用户配置的站点，厂商路径明确声明；不忽略取消、不跟随重定向或发往固定官方 host。
  it("各查询使用声明路径和 Bearer 认证，并沿当前连接 origin", async () => {
    for (const { provider, body, path } of [
      { provider: createDeepSeekUsage, body: deepseek, path: "/user/balance" },
      { provider: createOpenCodeUsage, body: opencode, path: "/zen/go/v1/usage" },
      { provider: (transport: typeof fetch) => createKimiUsage("kimi-plan-cn", transport), body: kimi, path: "/coding/v1/usages" },
      { provider: (transport: typeof fetch) => createMoonshotUsage("kimi", transport), body: moonshot, path: "/v1/users/me/balance" },
    ]) {
      const transport = vi.fn<typeof fetch>(async () => Response.json(body));
      const signal = new AbortController().signal;
      await provider(transport).query({ connection: { id: "renamed", endpoint: "https://relay.test/anything/v1" }, credential: "test-key", signal });
      expect(String(transport.mock.calls[0]![0])).toBe(`https://relay.test${path}`);
      expect(transport.mock.calls[0]![1]).toMatchObject({ signal, redirect: "error", headers: { Authorization: "Bearer test-key" } });
    }
  });
  // 预设的 usage 必须能找到同名提供方；不把限流响应头或未适配产品隐式接入账户查询。
  it("支持的预设与查询目录同名绑定，未支持的预设保持关闭", () => {
    const ids = createBuiltinUsageProviders().map(provider => provider.id).sort();
    expect(ids).toEqual(["openai", "anthropic", "xai", "deepseek", "kimi", "kimi-cn", "kimi-plan", "kimi-plan-cn", "opencode-plan", "openrouter", "zai-plan", "zai-plan-cn"].sort());
    for (const preset of providerPresets) {
      expect(preset.connection.usage ?? null).toBe(ids.includes(preset.id) ? preset.id : null);
    }
  });
});
