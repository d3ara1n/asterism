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
  // 提供方样式先于消费者，视图初始化只能在样式准备完成后执行。
  it("按依赖顺序加载样式与入口，初始化失败移除已加载样式", async () => {
    const seen: string[] = [], removed: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await loadPluginRenderers([
        { id: "consumer", renderer: "consumer.js", stylesheet: "consumer.css", dependencies: ["provider"] },
        { id: "provider", renderer: "provider.js", stylesheet: "provider.css", dependencies: [] },
      ], {
        async loadStylesheet(path) { seen.push(path); return () => { removed.push(path); }; },
        async load(path) { seen.push(path); return { default: {} }; },
        async accept(_plugin, id) { seen.push(id); if (id === "consumer") throw new Error("Preparation failed."); },
      });
      expect(seen).toEqual(["provider.css", "provider.js", "provider", "consumer.css", "consumer.js", "consumer"]);
      expect(removed).toEqual(["consumer.css"]);
      expect(result.failures).toEqual([{ id: "consumer", error: "Preparation failed." }]);
    } finally { log.mockRestore(); }
  });
  // 样式失败不能让缺少样式的提供方进入执行，也不能影响无关插件。
  it("样式加载失败阻断入口及依赖方，无样式插件仍正常加载", async () => {
    const loaded: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await loadPluginRenderers([
        { id: "consumer", renderer: "consumer.js", dependencies: ["provider"] },
        { id: "provider", renderer: "provider.js", stylesheet: "provider.css", dependencies: [] },
        { id: "other", renderer: "other.js", dependencies: [] },
      ], {
        async loadStylesheet() { throw new Error("Stylesheet unavailable."); },
        async load(path) { loaded.push(path); return { default: {} }; },
      });
      expect(loaded).toEqual(["other.js"]);
      expect(result.failures.map(item => item.id)).toEqual(["provider", "consumer"]);
    } finally { log.mockRestore(); }
  });
});
