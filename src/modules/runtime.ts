/// <reference types="vite/client" />
import { definePlugin, PluginApiError, type PluginDefinition, type PluginModule } from "@atelier/sdk/runtime";
import { loadPlugins, type PluginHostServices } from "../plugins/loader.ts";
import { core, coreVersion } from "./plugin.ts";
import { createNamingModule, type NamingApi } from "./naming/runtime.ts";

const entries = import.meta.glob<PluginModule>(["./*/runtime.ts", "!./naming/runtime.ts"], { eager: true, import: "default" });

/** 装配顺序：atelier.core 最先，外部插件包随后，按用户列表顺序。 */
export function createModules(services: PluginHostServices, external: readonly PluginDefinition[] = []) {
  let naming: NamingApi | null = null;
  let closed = false;
  const modules: Record<string, PluginModule> = { ...entries, "./naming/runtime.ts": createNamingModule(api => {
    naming = api;
    return () => { naming = null; };
  }) };
  const corePlugin = definePlugin({
    namespace: core, version: coreVersion,
    modules: Object.keys(modules).sort().map(path => modules[path]!),
  });
  const loaded = loadPlugins([corePlugin, ...external], services);
  const available = loaded.manifest.some(plugin => plugin.id === core.id && plugin.status === "loaded");
  return {
    ...loaded,
    naming: {
      nameByUser(sessionId, title) {
        if (closed || !available || !naming) throw new PluginApiError("unavailable", "Session naming is unavailable.");
        naming.nameByUser(sessionId, title);
      },
    } satisfies NamingApi,
    close() { closed = true; return loaded.close(); },
  };
}
