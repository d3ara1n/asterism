/// <reference types="vite/client" />
import { definePlugin, type PluginModule } from "../plugins/contract.ts";
import { loadPlugins, type PluginHostServices } from "../plugins/loader.ts";
import { core, coreVersion } from "./plugin.ts";

const entries = import.meta.glob<PluginModule>("./*/runtime.ts", { eager: true, import: "default" });

/** 内置功能插件：编译期收集后台模块入口；前端入口不会进入任务运行时的依赖图。 */
export const corePlugin = definePlugin({ namespace: core, version: coreVersion,
  modules: Object.keys(entries).sort().map(path => entries[path]!) });

/** 装配顺序：atelier.core 最先，外部插件随后（外部加载待实现）。 */
export function createModules(services: PluginHostServices) {
  return loadPlugins([corePlugin], services);
}
