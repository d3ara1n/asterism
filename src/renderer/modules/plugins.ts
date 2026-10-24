import * as React from "react";
import * as ReactJsx from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ReactIntl from "react-intl";
import * as zod from "zod";
import * as sdkContracts from "@atelier/sdk/contracts";
import * as sdkRenderer from "@atelier/sdk/renderer";
import type { RendererModule, RendererPlugin } from "@atelier/sdk/renderer";
import { awaitStartup } from "../app/boot.ts";

/** 共享模块白名单：插件 bundle 的这些导入解析到宿主同一实例，保证只有一个 React。 */
(globalThis as Record<string, unknown>).__atelierRendererModules = {
  react: React, "react/jsx-runtime": ReactJsx, "react-dom": ReactDom, "react-dom/client": ReactDomClient,
  zod, "@atelier/sdk/contracts": sdkContracts, "@atelier/sdk/renderer": sdkRenderer,
  "react-intl": ReactIntl,
};

export interface PluginRendererFailure { id: string; error: string }
export interface RendererEntry { id: string; renderer: string | null; dependencies: readonly string[] }
export function validateRendererPlugin(plugin: RendererPlugin | undefined): asserts plugin is RendererPlugin {
  if (!plugin || typeof plugin !== "object" || "resources" in plugin || "cards" in plugin || "tools" in plugin
    || (plugin.modules !== undefined && !Array.isArray(plugin.modules))
    || (plugin.prepare !== undefined && typeof plugin.prepare !== "function")
    || (plugin.closing !== undefined && typeof plugin.closing !== "function"))
    throw new Error("The renderer entry must default-export defineRendererPlugin(...).");
  const settings = plugin.settings;
  if (settings !== undefined) {
    if (!settings || typeof settings !== "object" || settings.Body === undefined)
      throw new Error("Plugin settings must declare a Body component.");
    const locations = settings.locations;
    if (locations !== undefined && (!Array.isArray(locations)
      || locations.some(location => typeof location !== "string" || !location.trim())
      || new Set(locations).size !== locations.length))
      throw new Error("Plugin settings locations must be unique non-empty strings.");
  }
  for (const module of plugin.modules ?? []) {
    if (!module || !Array.isArray(module.resources) || !Array.isArray(module.cards) || !Array.isArray(module.tools)
      || (module.creations !== undefined && !Array.isArray(module.creations))
      || (module.records !== undefined && !Array.isArray(module.records))
      || (module.prepare !== undefined && typeof module.prepare !== "function"))
      throw new Error("Renderer modules must declare { resources, cards, tools }.");
  }
}
/** 按公共依赖装配；导入、视图冲突或提供方失败均阻止其消费者。 */
export async function loadPluginRenderers(entries: readonly RendererEntry[], options: {
  available?: readonly string[];
  signal?: AbortSignal;
  progress?(id: string): void;
  accept?(plugin: RendererPlugin, id: string): void | Promise<void>;
  load?(path: string): Promise<{ default?: RendererPlugin }>;
} = {}):
  Promise<{ modules: RendererModule[]; failures: PluginRendererFailure[] }> {
  const modules: RendererModule[] = [];
  const failures: PluginRendererFailure[] = [];
  const available = new Set(options.available);
  const visiting = new Set<string>();
  const failed = new Set<string>();
  const load = options.load ?? (path => import(/* @vite-ignore */ `atelier-plugin://${path}`));
  const visit = async (id: string): Promise<void> => {
    options.signal?.throwIfAborted();
    if (available.has(id)) return;
    if (failed.has(id)) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    if (visiting.has(id)) throw new Error(`Circular renderer dependency: ${id}.`);
    const entry = entries.find(entry => entry.id === id);
    if (!entry) throw new Error(`Public renderer dependency ${id} is unavailable.`);
    visiting.add(id);
    try {
      for (const dependency of entry.dependencies) await visit(dependency);
      if (!entry.renderer) { available.add(id); return; }
      options.progress?.(id);
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error(`Plugin ${id} renderer import timed out.`)), 10_000);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
      const loaded = await awaitStartup(load(entry.renderer), signal).finally(() => clearTimeout(timer));
      options.signal?.throwIfAborted();
      const plugin = loaded.default;
      validateRendererPlugin(plugin);
      await options.accept?.(plugin, id);
      modules.push(...plugin.modules ?? []); available.add(id);
    } catch (error) {
      console.error(`Plugin ${entry.id} renderer could not be loaded.`, error);
      failed.add(id);
      failures.push({ id: entry.id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally { visiting.delete(id); }
  };
  for (const entry of entries) {
    try { await visit(entry.id); }
    catch { options.signal?.throwIfAborted(); /* 本插件及依赖失败均已记录；继续装配无关插件。 */ }
  }
  return { modules, failures };
}
