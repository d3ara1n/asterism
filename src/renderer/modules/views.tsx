import { createContext, useContext, useMemo, type ReactNode } from "react";
import { RendererResourcesProvider } from "@atelier/sdk/renderer";
import type { ViewRegistry } from "./registry";

const Views = createContext<ViewRegistry | null>(null);
export function ModuleViewsProvider({ registry, children }: { registry: ViewRegistry; children: ReactNode }) {
  const resources = useMemo(() => ({
    get: (kind: string) => registry.resource(kind),
    list: () => registry.resourceDescriptions(),
  }), [registry]);
  return <Views.Provider value={registry}><RendererResourcesProvider value={resources}>{children}</RendererResourcesProvider></Views.Provider>;
}
export function useModuleViews(): ViewRegistry {
  const registry = useContext(Views);
  if (!registry) throw new Error("Module views must be provided by the application root.");
  return registry;
}
export { JsonView } from "@atelier/ui/json-view";
