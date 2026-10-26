import { PluginApiError, type PluginDefinition } from "@asterism/sdk/runtime";
import { builtin, type NamingApi } from "@asterism/builtin-api/contracts";
import { createBuiltin } from "@asterism/builtin/runtime";
import builtinStorage from "@asterism/builtin/storage";
import { loadPlugins, type PluginHostServices } from "../plugins/loader.ts";
import { applicationBrand, applicationUserAgent } from "../shared/application.ts";
import { fileURLToPath } from "node:url";

// 源码和 dist/main 相对仓库／应用根的深度相同；原生搜索读取安装包解包后的手册。
const manualDirectory = fileURLToPath(new URL("../../docs/manual/", import.meta.url))
  .replace(/([\\/])([^\\/]+\.asar)(?=[\\/])/g, "$1$2.unpacked");

/** 应用装配负责连接内置领域接口与宿主，不进入插件实现包。 */
export function createModules(services: PluginHostServices, external: readonly PluginDefinition[] = []) {
  let naming: NamingApi | null = null;
  let closed = false;
  const definition = createBuiltin({ application: { name: applicationBrand.en, userAgent: applicationUserAgent },
    manualDirectory,
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
