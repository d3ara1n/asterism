import { PluginApiError, type PluginDefinition } from "@asterism/sdk/runtime";
import { builtin, type NamingApi } from "@asterism/builtin-api/contracts";
import { createBuiltin } from "@asterism/builtin/runtime";
import builtinStorage from "@asterism/builtin/storage";
import { loadPlugins, type PluginHostServices } from "../plugins/loader.ts";
import { applicationBrand, applicationUserAgent } from "../shared/application.ts";
import { fileURLToPath } from "node:url";

// Source and dist/main have the same depth relative to repository/application roots; native search reads unpacked installed manuals.
const manualDirectory = fileURLToPath(new URL("../../docs/manual/", import.meta.url))
  .replace(/([\\/])([^\\/]+\.asar)(?=[\\/])/g, "$1$2.unpacked");

/** Application assembly connects built-in domain interfaces with the host without entering plugin implementation packages. */
export function createModules(services: PluginHostServices, external: readonly PluginDefinition[] = []) {
  let naming: NamingApi | null = null;
  let closed = false;
  const definition = createBuiltin({ application: { name: applicationBrand.en, userAgent: applicationUserAgent },
    manualDirectory,
    connectNaming(api) { naming = api; return () => { naming = null; }; } });
  // Built-in and external plugins share storage declarations and preparation failure handling.
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
