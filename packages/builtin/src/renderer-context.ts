import { createContext, createElement, useContext, type ReactNode } from "react";
import type { RendererPreferences } from "@atelier/sdk/renderer";
import { CreationDirectoryProvider } from "./resources/directory";

/** 应用组合注入宿主服务；内置插件不读取宿主存储实现。 */
export interface BuiltinRendererServices {
  preferences(pluginId: string): RendererPreferences;
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
