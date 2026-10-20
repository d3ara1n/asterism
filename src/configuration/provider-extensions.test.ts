import { describe, expect, it } from "vitest";
import type { ProviderPreset, UsageItem } from "@atelier/sdk/contracts";
import type { QueryUsageProvider } from "@atelier/sdk/runtime";
import { ProviderExtensions } from "./provider-extensions.ts";
import { RunLifecycle } from "../plugins/lifecycle.ts";

const preset: ProviderPreset = { id: " p ", name: "P", billing: "none", sources: ["https://example.test/docs"], verifiedOn: "2026-10-20",
  connection: { protocol: "openai-chat", baseUrl: "https://example.test", auth: "none", compatibility: [] } };
describe("提供商贡献目录", () => {
  // schema 会 trim 身份；去重、patch 和寻址必须都消费同一归一化值。
  it("归一化身份用于注册、修改和去重，失败不留下半份目录", async () => {
    const registry = new ProviderExtensions(), lifecycle = new RunLifecycle(() => {});
    try {
      registry.declare("test.a", [{ id: " q ", label: "Q", query: async () => [] }], [
        { type: "add", preset }, { type: "patch", id: " p ", patch: { name: "Patched" } },
      ], lifecycle.group("call"));
      expect(registry.get("q")).not.toBeNull();
      expect(registry.usageProviders()[0]?.id).toBe("q");
      expect(registry.presets()[0]).toMatchObject({ id: "p", name: "Patched" });
      expect(() => registry.declare("test.b", [], [{ type: "add", preset: { ...preset, id: "p" } }], lifecycle.group("call"))).toThrow("Duplicate provider preset");
      expect(() => registry.declare("test.b", [{ id: "q", label: "Q2", query: async () => [] }], [], lifecycle.group("call"))).toThrow("Duplicate usage provider");
      expect(registry.presets()).toHaveLength(1);
    } finally { await lifecycle.close(); }
  });
  // UsageProvider 是结构接口，类实例和闭包同样合法；注册不能丢失原型方法或其 this。
  it("查询保留类实例的方法接收者", async () => {
    class Balance implements QueryUsageProvider {
      id = "balance"; label = "Balance"; #remaining = 12;
      async query(): Promise<UsageItem[]> { return [{ id: "wallet", type: "balance", scope: "account", label: "Wallet", remaining: this.#remaining, currency: "USD" }]; }
    }
    const registry = new ProviderExtensions(), lifecycle = new RunLifecycle(() => {});
    try {
      registry.declare("test.a", [new Balance()], [], lifecycle.group("call"));
      const provider = registry.get("balance")!;
      if (provider.source === "headers") throw new Error("Expected query provider");
      expect(await provider.query({ connection: { id: "p", endpoint: "https://example.test" }, credential: null, signal: new AbortController().signal }))
        .toMatchObject([{ remaining: 12 }]);
    } finally { await lifecycle.close(); }
  });
});
