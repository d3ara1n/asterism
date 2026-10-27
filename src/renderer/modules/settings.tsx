import { createContext, useContext, type ReactNode } from "react";
import type { PluginSettingsPage } from "@asterism-app/sdk/renderer";

export interface PluginSettingsRegistry {
  pages: ReadonlyMap<string, PluginSettingsPage>;
  failures: ReadonlyMap<string, string>;
}
const Settings = createContext<PluginSettingsRegistry>({ pages: new Map(), failures: new Map() });
export function PluginSettingsProvider({ value, children }: { value: PluginSettingsRegistry; children: ReactNode }) {
  return <Settings.Provider value={value}>{children}</Settings.Provider>;
}
export const usePluginSettingsRegistry = () => useContext(Settings);
