import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const pluginsMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  application: { id: "settings.application", defaultMessage: "Application" },
  applicationSummary: { id: "settings.applicationSummary", defaultMessage: "Manage Atelier’s preferences and shared configuration." },
  plugins: { id: "settings.plugins", defaultMessage: "Plugins" },
  pluginsSummary: { id: "settings.pluginsSummary", defaultMessage: "Plugins provide Atelier’s core features and extensions. Find their settings in the corresponding plugin." },
  search: { id: "plugins.search", defaultMessage: "Search plugins…" },
  filter: { id: "plugins.filter", defaultMessage: "Filter plugins" },
  all: { id: "plugins.all", defaultMessage: "All plugins" },
  builtIn: { id: "plugins.builtIn", defaultMessage: "Built-in" },
  noResults: { id: "plugins.noResults", defaultMessage: "No matching plugins" },
  noPage: { id: "plugins.noPage", defaultMessage: "This plugin does not provide a settings page." },
  pageUnavailable: { id: "plugins.pageUnavailable", defaultMessage: "The settings page is unavailable. Check the plugin status above." },
  pageFailed: { id: "plugins.pageFailed", defaultMessage: "The plugin settings page could not be displayed." },
  retry: { id: "plugins.retry", defaultMessage: "Try again" },
  removeTitle: { id: "plugins.removeTitle", defaultMessage: "Remove this plugin?" },
  removeHint: { id: "plugins.removeHint", defaultMessage: "Removal takes effect after restarting. Plugin data and session history are kept." },
  cancel: { id: "plugins.cancel", defaultMessage: "Cancel" },
  operationFailed: { id: "plugins.operationFailed", defaultMessage: "The plugin operation failed. Try again." },
  configurationUnavailable: { id: "plugins.configurationUnavailable", defaultMessage: "This plugin has not registered the requested configuration." },
  loaded: {
    id: "features_plugins_PluginsSettings_1",
    defaultMessage: "Loaded",
  },
  disabled: {
    id: "features_plugins_PluginsSettings_2",
    defaultMessage: "Disabled",
  },
  invalidPackage: {
    id: "features_plugins_PluginsSettings_3",
    defaultMessage: "Invalid package",
  },
  failed: {
    id: "features_plugins_PluginsSettings_4",
    defaultMessage: "Failed",
  },
  restartRequired: {
    id: "features_plugins_PluginsSettings_5",
    defaultMessage: "Takes effect after restart",
  },
  restartHint: {
    id: "features_plugins_PluginsSettings_7",
    defaultMessage: "Restart Atelier to apply plugin changes.",
  },
  unknownPlugin: {
    id: "features_plugins_PluginsSettings_9",
    defaultMessage: "Unknown plugin",
  },
  enablePlugin: {
    id: "features_plugins_PluginsSettings_21",
    defaultMessage: "Enable {plugin_name}",
  },
  remove: {
    id: "features_plugins_PluginsSettings_12",
    defaultMessage: "Remove",
  },
  addPackage: {
    id: "features_plugins_PluginsSettings_13",
    defaultMessage: "Add package…",
  },
  settingsLoadFailed: {
    id: "features_plugins_PluginsSettings_14",
    defaultMessage: "Plugin settings could not be loaded.",
  },
}));
