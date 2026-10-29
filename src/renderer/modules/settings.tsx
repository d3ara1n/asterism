import { createContext, useContext, type ReactNode } from "react";
import type { PluginSettingsPage, PluginSessionEntry } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";

/** Registration attaches the contributing plugin's display name, read by every surface that names the plugin. */
export interface RegisteredSettingsPage extends PluginSettingsPage { pluginId: string; pluginName: UiText }
export interface RegisteredSessionEntry extends PluginSessionEntry { pluginId: string; pluginName: UiText }
export const settingsPageKey = (pluginId: string, pageId: string) => `plugin:${JSON.stringify([pluginId, pageId])}`;
export interface PluginSettingsRegistry {
  pages: ReadonlyMap<string, RegisteredSettingsPage>;
  failures: ReadonlyMap<string, string>;
  sessionEntries: readonly RegisteredSessionEntry[];
}
const Settings = createContext<PluginSettingsRegistry>({ pages: new Map(), failures: new Map(), sessionEntries: [] });
export function PluginSettingsProvider({ value, children }: { value: PluginSettingsRegistry; children: ReactNode }) {
  return <Settings.Provider value={value}>{children}</Settings.Provider>;
}
export const usePluginSettingsRegistry = () => useContext(Settings);
