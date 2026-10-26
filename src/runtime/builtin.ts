import { PluginApiError, type PluginDefinition } from "@atelier/sdk/runtime";
import { builtin, type NamingApi } from "@atelier/builtin-api/contracts";
import { createBuiltin } from "@atelier/builtin/runtime";
import builtinStorage from "@atelier/builtin/storage";
import { loadPlugins, type PluginHostServices } from "../plugins/loader.ts";
import { applicationBrand, applicationUserAgent } from "../shared/application.ts";

/** 应用装配负责连接内置领域接口与宿主，不进入插件实现包。 */
export function createModules(services: PluginHostServices, external: readonly PluginDefinition[] = []) {
  let naming: NamingApi | null = null;
  let closed = false;
  const definition = createBuiltin({ application: { name: applicationBrand.en, userAgent: applicationUserAgent },
    connectNaming(api) { naming = api; return () => { naming = null; }; } });
  // 内置插件与外部插件共用存储声明与准备失败的处理。
  const declarations = new Map(services.preparedStorage?.declarations);
  declarations.set(builtin.id, builtinStorage);
  const loaded = loadPlugins([definition, ...external], { ...services,
    preparedStorage: { declarations, failures: services.preparedStorage?.failures ?? new Map() } });
  const available = loaded.manifest.some(plugin => plugin.id === builtin.id && plugin.status === "loaded");
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
