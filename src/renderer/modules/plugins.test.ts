import { describe, expect, it, vi } from "vitest";
import { loadPluginRenderers, validateRendererPlugin } from "./plugins";
import { memo, forwardRef } from "react";

describe("Plugin frontend entry", () => {
  it("rejects ambiguous navigation when a plugin declares the same main view ID twice", () => {
    const Body = memo(() => null);
    expect(() => validateRendererPlugin({ mainViews: [{ id: "reports", title: "Reports", Body }] })).not.toThrow();
    expect(() => validateRendererPlugin({ mainViews: [
      { id: "reports", title: "Reports", Body },
      { id: "reports", title: "Other reports", Body },
    ] })).toThrow(/main views need unique IDs/);
  });
  // ComponentType allows React-wrapped components; a runtime typeof function check must not reject the entire plugin.
  it.each([memo(() => null), forwardRef<unknown, { location?: string }>(() => null)])("accepts React-wrapped settings pages", async Body => {
    const loaded = await loadPluginRenderers([{ id: "wrapped", renderer: "wrapped", dependencies: [] }], {
      load: async () => ({ default: { settings: [{ id: "general", title: "General", summary: "Preferences", Body }] } }),
    });
    expect(loaded.outcomes.get("wrapped")).toEqual({ status: "ready", diagnostics: [] });
  });
  // Settings belong to the plugin itself: it can provide a page without any resource/tool view modules.
  it("accepts plugins with only a settings page, while entry initialization failure still blocks consumers", async () => {
    const seen: string[] = [];
    const Body = () => null;
    const loaded = await loadPluginRenderers([{ id: "settings", renderer: "settings", dependencies: [] }], {
      load: async () => ({ default: { settings: [{ id: "general", title: "General", summary: "Preferences", Body, locations: ["account"] }] } }),
      accept(plugin, id) { expect(plugin.settings?.[0]?.Body).toBe(Body); seen.push(id); },
    });
    expect(seen).toEqual(["settings"]);
    expect(loaded.outcomes.get("settings")).toEqual({ status: "ready", diagnostics: [] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await loadPluginRenderers([
        { id: "consumer", renderer: "consumer", dependencies: ["provider"] },
        { id: "provider", renderer: "provider", dependencies: [] },
      ], { load: async () => ({ default: {} }), async accept() { throw new Error("Preparation failed."); } });
      expect([...failed.outcomes].map(([id, result]) => [id, result.status])).toEqual([["provider", "failed"], ["consumer", "failed"]]);
    } finally { log.mockRestore(); }
  });
  // Provider styles precede consumer styles, and view initialization can run only after styles are ready.
  it("loads styles and entries in dependency order and removes loaded styles on initialization failure", async () => {
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
      expect(result.outcomes.get("consumer")).toEqual({ status: "failed", diagnostics: [{ stage: "prepare", message: "Preparation failed." }] });
    } finally { log.mockRestore(); }
  });
  // Style failure must prevent the provider from running without styles, while leaving unrelated plugins unaffected.
  it("style loading failure blocks the entry and its dependents, while plugins without styles load normally", async () => {
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
      expect([...result.outcomes].filter(([, result]) => result.status === "failed").map(([id]) => id)).toEqual(["provider", "consumer"]);
    } finally { log.mockRestore(); }
  });
  it("retains frontend dependents when only a provider feature module failed to prepare", async () => {
    const prepared: string[] = [];
    const result = await loadPluginRenderers([
      { id: "consumer", renderer: "consumer.js", dependencies: ["provider"] },
      { id: "provider", renderer: "provider.js", dependencies: [] },
    ], {
      load: async () => ({ default: {} }),
      accept(_plugin, id) {
        prepared.push(id);
        return id === "provider" ? [{ stage: "module", module: 1, message: "Optional view data is unavailable." }] : [];
      },
    });
    expect(prepared).toEqual(["provider", "consumer"]);
    expect(result.outcomes.get("provider")).toEqual({ status: "partial",
      diagnostics: [{ stage: "module", module: 1, message: "Optional view data is unavailable." }] });
    expect(result.outcomes.get("consumer")).toEqual({ status: "ready", diagnostics: [] });
  });
  it("loads the complete public-only provider style closure before consumers without evaluating unused public modules", async () => {
    const seen: string[] = [];
    const result = await loadPluginRenderers([
      { id: "consumer", renderer: "consumer.js", dependencies: ["public"] },
      { id: "public", renderer: null, stylesheet: "shared.css", stylesheets: ["shared.css", "public.css"], dependencies: [] },
    ], {
      async loadStylesheet(path) { seen.push(path); return () => {}; },
      async load(path) { seen.push(path); return { default: {} }; },
    });
    expect(seen).toEqual(["shared.css", "public.css", "consumer.js"]);
    expect(result.outcomes.get("public")).toEqual({ status: "ready", diagnostics: [] });
  });

  it.each([false, true])("rejects mixed public-only initialization cycles before loading styles or entries (reverse=%s)", async reverse => {
    const entries = [
      { id: "api", renderer: null, stylesheets: ["api.css"], dependencies: ["plugin"] },
      { id: "plugin", renderer: "plugin.mjs", dependencies: ["api"] },
    ];
    const loaded: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await loadPluginRenderers(reverse ? entries.reverse() : entries, {
        async loadStylesheet(path) { loaded.push(path); throw new Error("A cycle must fail before styles load"); },
        async load(path) { loaded.push(path); return { default: {} }; },
      });
      expect(loaded).toEqual([]);
      expect(result.outcomes.get("api")?.status).toBe("failed");
      expect(result.outcomes.get("plugin")?.status).toBe("failed");
    } finally { log.mockRestore(); }
  });

  it("leaves module-only cycles to native ESM before a consumer initializes", async () => {
    const loaded: string[] = [];
    const result = await loadPluginRenderers([
      { id: "consumer", renderer: "consumer.mjs", dependencies: ["api-a"] },
      { id: "api-a", renderer: null, dependencies: ["api-b"] },
      { id: "api-b", renderer: null, dependencies: ["api-a"] },
    ], { async load(path) { loaded.push(path); return { default: {} }; } });
    expect(loaded).toEqual(["consumer.mjs"]);
    expect(result.outcomes.get("consumer")?.status).toBe("ready");
  });

  it("releases the already loaded provider stylesheet closure when a later stylesheet fails and blocks consumers", async () => {
    const removed: string[] = [], imported: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await loadPluginRenderers([
        { id: "consumer", renderer: "consumer.js", dependencies: ["public"] },
        { id: "public", renderer: null, stylesheets: ["first.css", "missing.css"], dependencies: [] },
      ], {
        async loadStylesheet(path) { if (path === "missing.css") throw new Error("Missing style"); return () => { removed.push(path); }; },
        async load(path) { imported.push(path); return { default: {} }; },
      });
      expect(removed).toEqual(["first.css"]);
      expect(imported).toEqual([]);
      expect(result.outcomes.get("consumer")?.status).toBe("failed");
    } finally { log.mockRestore(); }
  });

});
