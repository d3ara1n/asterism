import { describe, expect, it } from "vitest";
import type { ModelProviderPreset, UsageItem } from "@asterism/sdk/contracts";
import type { QueryUsageProvider } from "@asterism/sdk/runtime";
import { ModelProviderExtensions } from "./provider-extensions.ts";
import { RunLifecycle } from "../plugins/lifecycle.ts";

const preset: ModelProviderPreset = { id: " p ", name: "P", billing: "none", sources: ["https://example.test/docs"], verifiedOn: "2026-10-20",
  connection: { protocol: "openai-chat", baseUrl: "https://example.test", auth: "none", compatibility: [] } };
describe("Provider contribution catalog", () => {
  // The schema trims identities; deduplication, patching, and addressing must all consume the same normalized value.
  it("uses normalized identities for registration, modification, and deduplication without leaving partial catalogs on failure", async () => {
    const registry = new ModelProviderExtensions(), lifecycle = new RunLifecycle(() => {});
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
  // UsageProvider is structural: class instances and closures are valid; registration must preserve prototype methods and their this receiver.
  it("queries preserve class method receivers", async () => {
    class Balance implements QueryUsageProvider {
      id = "balance"; label = "Balance"; #remaining = 12;
      async query(): Promise<UsageItem[]> { return [{ id: "wallet", type: "balance", scope: "account", label: "Wallet", remaining: this.#remaining, currency: "USD" }]; }
    }
    const registry = new ModelProviderExtensions(), lifecycle = new RunLifecycle(() => {});
    try {
      registry.declare("test.a", [new Balance()], [], lifecycle.group("call"));
      const provider = registry.get("balance")!;
      if (provider.source === "headers") throw new Error("Expected query provider");
      expect(await provider.query({ connection: { id: "p", endpoint: "https://example.test" }, credential: null, signal: new AbortController().signal }))
        .toMatchObject([{ remaining: 12 }]);
    } finally { await lifecycle.close(); }
  });
});
