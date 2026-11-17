import type { RendererModule, RendererPlugin } from "@asterism-app/sdk/renderer";
import { awaitStartup } from "../app/boot.ts";
import { loadPluginStylesheet } from "./plugin-styles.ts";
import { installPluginImportMap } from "./shared-modules.ts";
import type { RendererDiagnostic, RendererOutcome } from "./plugin-outcome";
import { pluginErrorMessage } from "../../shared/plugin-startup";

export interface RendererEntry { id: string; renderer: string | null; stylesheet?: string | null; stylesheets?: readonly string[]; dependencies: readonly string[] }
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
  if (plugin.commands !== undefined) {
    if (!Array.isArray(plugin.commands)) throw new Error("Plugin commands must be an array of groups.");
    const ids = new Set<string>();
    for (const group of plugin.commands) {
      if (!group || typeof group.id !== "string" || !group.id.trim() || group.id !== group.id.trim() || ids.has(group.id)
        || group.label === undefined || typeof group.useCommands !== "function")
        throw new Error("Command groups need unique non-empty trimmed IDs, labels, and useCommands hooks.");
      ids.add(group.id);
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
  importMap?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  progress?(id: string): void;
  accept?(plugin: RendererPlugin, id: string): void | readonly RendererDiagnostic[] | Promise<void | readonly RendererDiagnostic[]>;
  load?(path: string): Promise<{ default?: RendererPlugin }>;
  loadStylesheet?(path: string, signal: AbortSignal): Promise<() => void>;
} = {}):
  Promise<{ modules: RendererModule[]; outcomes: ReadonlyMap<string, RendererOutcome> }> {
  if (!options.load) installPluginImportMap(options.importMap ?? {});
  const modules: RendererModule[] = [];
  const outcomes = new Map<string, RendererOutcome>();
  const available = new Set(options.available);
  const visiting: string[] = [];
  const failed = new Set<string>();
  const load = options.load ?? (path => import(/* @vite-ignore */ `asterism-plugin://${path}`));
  const loadStylesheet = options.loadStylesheet ?? loadPluginStylesheet;
  const visit = async (id: string): Promise<void> => {
    options.signal?.throwIfAborted();
    if (available.has(id)) return;
    if (failed.has(id)) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    const cycleStart = visiting.indexOf(id);
    if (cycleStart !== -1) {
      const cycle = visiting.slice(cycleStart);
      // Only module-only cycles can defer entirely to ESM. Styles also need ordered admission.
      if (cycle.every(member => {
        const entry = entries.find(candidate => candidate.id === member)!;
        return !entry.renderer && !entry.stylesheet && !entry.stylesheets?.length;
      })) return;
      throw new Error(`Circular renderer initialization dependency: ${cycle.join(" -> ")} -> ${id}.`);
    }
    const entry = entries.find(entry => entry.id === id);
    if (!entry) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    visiting.push(id);
    const releaseStylesheets: (() => void)[] = [];
    let stage: RendererDiagnostic["stage"] = "dependency";
    try {
      for (const dependency of entry.dependencies) await visit(dependency);
      options.progress?.(id);
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error(`Plugin ${id} renderer loading timed out.`)), 10_000);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
      let loaded: { default?: RendererPlugin } = {};
      try {
        stage = "style";
        for (const path of new Set([...(entry.stylesheets ?? []), ...entry.stylesheet ? [entry.stylesheet] : []]))
          releaseStylesheets.push(await loadStylesheet(path, signal));
        stage = "import";
        if (entry.renderer) loaded = await awaitStartup(load(entry.renderer), signal);
      } finally { clearTimeout(timer); }
      options.signal?.throwIfAborted();
      if (options.signal) options.signal.addEventListener("abort", () => { for (const release of releaseStylesheets) release(); }, { once: true });
      if (!entry.renderer) { available.add(id); outcomes.set(id, { status: "ready", diagnostics: [] }); return; }
      const plugin = loaded.default;
      validateRendererPlugin(plugin);
      stage = "prepare";
      const diagnostics = await options.accept?.(plugin, id) ?? [];
      outcomes.set(id, { status: diagnostics.length ? "partial" : "ready", diagnostics });
      modules.push(...plugin.modules ?? []); available.add(id);
    } catch (error) {
      for (const release of releaseStylesheets.reverse()) release();
      console.error(`Plugin ${entry.id} renderer could not be loaded.`, error);
      failed.add(id);
      outcomes.set(id, { status: "failed", diagnostics: [{ stage, message: pluginErrorMessage(error) }] });
      throw error;
    } finally { visiting.pop(); }
  };
  for (const entry of entries) {
    try { await visit(entry.id); }
    catch { options.signal?.throwIfAborted(); /* Failures in this plugin and its dependencies are already logged; continue assembling unrelated plugins. */ }
  }
  return { modules, outcomes };
}
