import { describe, expect, it, vi } from "vitest";
import { loadPluginRenderers } from "./plugins";
import { memo, forwardRef } from "react";

describe("插件前端入口", () => {
  // ComponentType 允许 React 包装组件，不能用运行时 typeof function 拒绝整个插件。
  it.each([memo(() => null), forwardRef<unknown, { location?: string }>(() => null)])("接受 React 包装的设置页面", async Body => {
    const loaded = await loadPluginRenderers([{ id: "wrapped", renderer: "wrapped", dependencies: [] }], {
      load: async () => ({ default: { settings: { Body } } }),
    });
    expect(loaded.failures).toEqual([]);
  });
  // 设置属于插件本身：没有任何资源/工具视图模块仍然能提供页面。
  it("接受只有设置页的插件，入口初始化失败继续阻断消费者", async () => {
    const seen: string[] = [];
    const Body = () => null;
    const loaded = await loadPluginRenderers([{ id: "settings", renderer: "settings", dependencies: [] }], {
      load: async () => ({ default: { settings: { Body, locations: ["account"] } } }),
      accept(plugin, id) { expect(plugin.settings?.Body).toBe(Body); seen.push(id); },
    });
    expect(seen).toEqual(["settings"]);
    expect(loaded).toEqual({ modules: [], failures: [] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await loadPluginRenderers([
        { id: "consumer", renderer: "consumer", dependencies: ["provider"] },
        { id: "provider", renderer: "provider", dependencies: [] },
      ], { load: async () => ({ default: {} }), async accept() { throw new Error("Preparation failed."); } });
      expect(failed.failures.map(item => item.id)).toEqual(["provider", "consumer"]);
    } finally { log.mockRestore(); }
  });
});
