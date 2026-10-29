import type { PluginMetadata, UiText } from "@asterism-app/sdk/contracts";

/** The manifest display name; packages whose manifest cannot be read fall back to their ID or source. */
export function pluginName(plugin: { id: string | null; source: string; metadata: PluginMetadata }): UiText {
  return plugin.metadata.name ?? plugin.id ?? plugin.source;
}
