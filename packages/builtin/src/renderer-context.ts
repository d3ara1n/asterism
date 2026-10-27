import { createContext, createElement, useContext, type ReactNode } from "react";
import type { RendererPreferences } from "@asterism/sdk/renderer";
import { CreationDirectoryProvider } from "./resources/directory";

/** Application composition injects host services; the built-in plugin does not read host storage implementations. */
export interface BuiltinRendererServices {
  preferences(pluginId: string): RendererPreferences;
  openLocalFile(path: string): Promise<void>;
}
const Services = createContext<BuiltinRendererServices | null>(null);
export function BuiltinRendererProvider({ services, children }: { services: BuiltinRendererServices; children: ReactNode }) {
  return createElement(Services.Provider, { value: services }, createElement(CreationDirectoryProvider, { children }));
}
export function useBuiltinRendererServices(): BuiltinRendererServices {
  const services = useContext(Services);
  if (!services) throw new Error("Builtin renderer services must be provided by the application.");
  return services;
}
