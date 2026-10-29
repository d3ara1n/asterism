import type { RendererModule, RendererPlugin } from "@asterism-app/sdk/renderer";
import { awaitStartup } from "../app/boot.ts";
import { loadPluginStylesheet } from "./plugin-styles.ts";
import { hostRendererModules } from "./shared-modules.ts";

(globalThis as Record<string, unknown>).__asterismRendererModules = hostRendererModules;

export interface PluginRendererFailure { id: string; error: string }
export interface RendererEntry { id: string; renderer: string | null; stylesheet?: string | null; dependencies: readonly string[] }
export function validateRendererPlugin(plugin: RendererPlugin | undefined): asserts plugin is RendererPlugin {
  if (!plugin || typeof plugin !== "object" || "resources" in plugin || "cards" in plugin || "tools" in plugin
    || (plugin.modules !== undefined && !Array.isArray(plugin.modules))
    || (plugin.prepare !== undefined && typeof plugin.prepare !== "function")
    || (plugin.closing !== undefined && typeof plugin.closing !== "function"))
    throw new Error("The renderer entry must default-export defineRendererPlugin(...).");
  const settings = plugin.settings;
  if (settings !== undefined) {
    if (!Array.isArray(settings)) throw new Error("Plugin settings must be an array of pages.");
    const ids = new Set<string>();
    for (const page of settings) {
      if (!page || typeof page.id !== "string" || !page.id.trim() || page.id !== page.id.trim() || ids.has(page.id))
        throw new Error("Plugin settings page IDs must be unique non-empty trimmed strings.");
      ids.add(page.id);
      if (page.title === undefined || page.summary === undefined || page.Body === undefined)
        throw new Error("Plugin settings pages must declare a title, summary, and Body component.");
      const locations = page.locations;
      if (locations !== undefined && (!Array.isArray(locations)
        || locations.some(location => typeof location !== "string" || !location.trim())
        || new Set(locations).size !== locations.length))
        throw new Error("Plugin settings locations must be unique non-empty strings.");
    }
  }
  if (plugin.sessionEntries !== undefined) {
    if (!Array.isArray(plugin.sessionEntries)) throw new Error("Session entries must be an array.");
    const ids = new Set<string>();
    for (const entry of plugin.sessionEntries) {
      if (!entry || typeof entry.id !== "string" || !entry.id.trim() || entry.id !== entry.id.trim() || ids.has(entry.id)
        || entry.title === undefined || entry.Body === undefined) throw new Error("Session entries need unique IDs, titles, and Body components.");
      ids.add(entry.id);
    }
  }
  for (const module of plugin.modules ?? []) {
    if (!module || !Array.isArray(module.resources) || !Array.isArray(module.cards) || !Array.isArray(module.tools)
      || (module.creations !== undefined && !Array.isArray(module.creations))
      || (module.records !== undefined && !Array.isArray(module.records))
      || (module.prepare !== undefined && typeof module.prepare !== "function"))
      throw new Error("Renderer modules must declare { resources, cards, tools }.");
  }
}
/** Assemble by public dependencies; import failures, view conflicts, or provider failures block consumers. */
export async function loadPluginRenderers(entries: readonly RendererEntry[], options: {
  available?: readonly string[];
  signal?: AbortSignal;
  progress?(id: string): void;
  accept?(plugin: RendererPlugin, id: string): void | Promise<void>;
  load?(path: string): Promise<{ default?: RendererPlugin }>;
  loadStylesheet?(path: string, signal: AbortSignal): Promise<() => void>;
} = {}):
  Promise<{ modules: RendererModule[]; failures: PluginRendererFailure[] }> {
  const modules: RendererModule[] = [];
  const failures: PluginRendererFailure[] = [];
  const available = new Set(options.available);
  const visiting = new Set<string>();
  const failed = new Set<string>();
  const load = options.load ?? (path => import(/* @vite-ignore */ `asterism-plugin://${path}`));
  const loadStylesheet = options.loadStylesheet ?? loadPluginStylesheet;
  const visit = async (id: string): Promise<void> => {
    options.signal?.throwIfAborted();
    if (available.has(id)) return;
    if (failed.has(id)) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    if (visiting.has(id)) throw new Error(`Circular renderer dependency: ${id}.`);
    const entry = entries.find(entry => entry.id === id);
    if (!entry) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    visiting.add(id);
    let releaseStylesheet: (() => void) | undefined;
    try {
      for (const dependency of entry.dependencies) await visit(dependency);
      if (!entry.renderer) { available.add(id); return; }
      options.progress?.(id);
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error(`Plugin ${id} renderer loading timed out.`)), 10_000);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
      let loaded: { default?: RendererPlugin };
      try {
        if (entry.stylesheet) releaseStylesheet = await loadStylesheet(entry.stylesheet, signal);
        loaded = await awaitStartup(load(entry.renderer), signal);
      } finally { clearTimeout(timer); }
      options.signal?.throwIfAborted();
      const plugin = loaded.default;
      validateRendererPlugin(plugin);
      await options.accept?.(plugin, id);
      modules.push(...plugin.modules ?? []); available.add(id);
    } catch (error) {
      releaseStylesheet?.();
      console.error(`Plugin ${entry.id} renderer could not be loaded.`, error);
      failed.add(id);
      failures.push({ id: entry.id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally { visiting.delete(id); }
  };
  for (const entry of entries) {
    try { await visit(entry.id); }
    catch { options.signal?.throwIfAborted(); /* Failures in this plugin and its dependencies are already logged; continue assembling unrelated plugins. */ }
  }
  return { modules, failures };
}
