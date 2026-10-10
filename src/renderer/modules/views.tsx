import { createContext, useContext, type ReactNode } from "react";
import type { ViewRegistry } from "./registry";

const Views = createContext<ViewRegistry | null>(null);
export function ModuleViewsProvider({ registry, children }: { registry: ViewRegistry; children: ReactNode }) {
  return <Views.Provider value={registry}>{children}</Views.Provider>;
}
export function useModuleViews(): ViewRegistry {
  const registry = useContext(Views);
  if (!registry) throw new Error("Module views must be provided by the application root.");
  return registry;
}
export function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}
